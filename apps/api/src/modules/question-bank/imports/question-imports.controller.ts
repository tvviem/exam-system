import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { validationFailed } from '../../../common/api-error';
import { pageSchema } from '../../../common/pagination';
import { MAX_UPLOAD_BYTES } from '../../../common/spreadsheet';
import { CurrentActor, CurrentUser, RequireTag } from '../../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../../identity/auth/auth.types';
import { buildQuestionImportTemplate } from './question-import-template';
import { QuestionImportsService } from './question-imports.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const itemsQuerySchema = pageSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(['valid', 'duplicate', 'error']).optional(),
});

// Đúng một trong hai: danh sách id, hoặc một nhóm.
const selectionSchema = z
  .strictObject({
    itemIds: z.array(z.uuid()).optional(),
    group: z.enum(['valid', 'duplicate']).optional(),
    selected: z.boolean(),
  })
  .refine((body) => (body.itemIds === undefined) !== (body.group === undefined), {
    message: 'Nêu itemIds hoặc group, không nêu cả hai',
  });

@RequireTag('examiner')
@Controller('question-imports')
export class QuestionImportsController {
  constructor(private readonly imports: QuestionImportsService) {}

  @Get('template')
  async template(@Res({ passthrough: true }) reply: FastifyReply) {
    reply
      .header('content-type', XLSX_TYPE)
      .header('content-disposition', 'attachment; filename="mau-nhap-cau-hoi.xlsx"');
    return buildQuestionImportTemplate();
  }

  /** multipart/form-data: trường `topicId` phải đứng trước trường `file` vì file được đọc theo luồng. */
  @Post()
  async create(@Req() req: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    if (!req.isMultipart()) throw validationFailed('file', 'required');
    const part = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    if (!part) throw validationFailed('file', 'required');
    const content = await part.toBuffer().catch((error: { code?: string }) => {
      throw error.code === 'FST_REQ_FILE_TOO_LARGE'
        ? validationFailed('file', 'file_too_large')
        : error;
    });
    const field = part.fields.topicId;
    const topicId =
      field && !Array.isArray(field) && field.type === 'field' ? String(field.value) : null;
    if (topicId !== null && !z.uuid().safeParse(topicId).success) {
      throw validationFailed('topicId', 'invalid');
    }
    return this.imports.create(user.id, { topicId, filename: part.filename, content });
  }

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.imports.list(user.id, pageSchema.parse(query ?? {}));
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.imports.detail(user.id, id);
  }

  @Get(':id/items')
  items(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.items(user.id, id, itemsQuerySchema.parse(query ?? {}));
  }

  @Patch(':id/items')
  select(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.imports.select(user.id, id, selectionSchema.parse(body ?? {}));
  }

  @Post(':id/commit')
  @HttpCode(200)
  commit(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.imports.commit(actor, id);
  }
}
