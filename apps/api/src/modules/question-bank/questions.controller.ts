import {
  normalizeTag,
  questionInputSchema,
  questionTypeSchema,
  TAG_FILTER_MAX,
  TAG_MATCHES,
} from '@exam/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { HeavyQuery } from '../../common/heavy-query';
import { pageSchema } from '../../common/pagination';
import { CurrentUser, RequireTag } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { QuestionsService } from './questions.service';

// Một `tag` hay nhiều `tag=…&tag=…`; chuẩn hóa như lúc lưu, bỏ rỗng và trùng.
const tagFilter = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => [...new Set([value ?? []].flat().map(normalizeTag))].filter(Boolean))
  .pipe(z.array(z.string().max(100)).max(TAG_FILTER_MAX));
const archived = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');
const listSchema = pageSchema.extend({
  topicId: z.uuid().optional(),
  type: questionTypeSchema.optional(),
  tag: tagFilter,
  tagMatch: z.enum(TAG_MATCHES).default('all'),
  q: z.string().trim().max(200).optional(),
  archived,
});
const tagListSchema = z.object({ topicId: z.uuid().optional(), archived });
const versionSchema = z.object({ version: z.number().int().min(1) });
const idsSchema = z.array(z.uuid()).min(1).max(200);
const moveSchema = z.strictObject({ ids: idsSchema, topicId: z.uuid() });
const deleteSchema = z.strictObject({ ids: idsSchema });

@RequireTag('examiner')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  @HeavyQuery('questions')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { page, pageSize, tag, ...filter } = listSchema.parse(query);
    return this.questions.list(user.id, { ...filter, tags: tag }, { page, pageSize });
  }

  // Đường dẫn tĩnh đặt trước các đường dẫn có :id.
  @Get('tags')
  @HeavyQuery('questions')
  tags(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.tags(user.id, tagListSchema.parse(query));
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.create(user.id, questionInputSchema.parse(body));
  }

  // Hai đường dẫn tĩnh đặt trước các đường dẫn có :id.
  @Post('move')
  @HttpCode(200)
  move(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const { ids, topicId } = moveSchema.parse(body ?? {});
    return this.questions.move(user.id, ids, topicId);
  }

  @Post('delete')
  @HttpCode(200)
  removeMany(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.remove(user.id, deleteSchema.parse(body ?? {}).ids);
  }

  @Post('archive')
  @HttpCode(200)
  archiveMany(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.archive(user.id, deleteSchema.parse(body ?? {}).ids);
  }

  @Post('restore')
  @HttpCode(200)
  restoreMany(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.restore(user.id, deleteSchema.parse(body ?? {}).ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.get(user.id, id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { version, ...input } = { ...versionSchema.parse(body), ...(body as object) };
    return this.questions.update(user.id, id, questionInputSchema.parse(input), version);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.questions.remove(user.id, [id]);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.duplicate(user.id, id);
  }
}
