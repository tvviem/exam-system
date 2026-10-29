import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { ApiError, validationFailed } from '../../../common/api-error';
import { pageSchema } from '../../../common/pagination';
import { AdminOnly, CurrentActor, CurrentUser, RequireTag } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { accountRequestStatusEnum, matchStatusEnum } from '../identity.schema';
import { MAX_UPLOAD_BYTES } from './account-request-file';
import { buildAccountRequestTemplate } from './account-request-template';
import { AccountRequestsService, canViewAccountRequests } from './account-requests.service';

const listSchema = pageSchema.extend({
  status: z.enum(accountRequestStatusEnum.enumValues).optional(),
});
const itemsSchema = pageSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  matchStatus: z.enum(matchStatusEnum.enumValues).optional(),
});
const rejectSchema = z.object({ note: z.string().max(1000).optional() }).strict();

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Người xem phải là Người ra đề hoặc Quản trị viên. */
function assertCanView(user: AuthenticatedUser) {
  if (!canViewAccountRequests(user)) throw new ApiError('FORBIDDEN');
}

@Controller('account-requests')
export class AccountRequestsController {
  constructor(private readonly requests: AccountRequestsService) {}

  @Get('template')
  async template(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    assertCanView(user);
    reply
      .header('content-type', XLSX_TYPE)
      .header('content-disposition', 'attachment; filename="mau-yeu-cau-cap-tai-khoan.xlsx"');
    return buildAccountRequestTemplate();
  }

  /**
   * multipart/form-data: trường `note` (tùy chọn) phải đứng trước trường `file` vì file được đọc theo luồng.
   */
  @RequireTag('examiner')
  @Post()
  async create(@Req() req: FastifyRequest, @CurrentActor() actor: Actor) {
    if (!req.isMultipart()) throw validationFailed('file', 'required');
    const part = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    if (!part) throw validationFailed('file', 'required');
    const content = await part.toBuffer().catch(() => {
      throw validationFailed('file', 'file_too_large');
    });
    const note = part.fields.note;
    return this.requests.create(actor, {
      filename: part.filename,
      content,
      note: note && !Array.isArray(note) && note.type === 'field' ? String(note.value) : null,
    });
  }

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    assertCanView(user);
    return this.requests.list(user, listSchema.parse(query ?? {}));
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    assertCanView(user);
    return this.requests.detail(user, id);
  }

  @Get(':id/items')
  items(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertCanView(user);
    return this.requests.items(user, id, itemsSchema.parse(query ?? {}));
  }

  @AdminOnly()
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
  ) {
    return this.requests.reject(actor, id, rejectSchema.parse(body ?? {}).note ?? null);
  }
}
