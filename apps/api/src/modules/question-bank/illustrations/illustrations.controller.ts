import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError, validationFailed } from '../../../common/api-error';
import { CANDIDATE_MEDIA, type CandidateMedia } from '../../../common/candidate-media';
import { DEVICE_COOKIE } from '../../../common/device-cookie';
import { pageSchema } from '../../../common/pagination';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { CurrentUser, RequireTag } from '../../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../../identity/auth/auth.types';
import { IllustrationsService } from './illustrations.service';
import { MAX_ILLUSTRATION_UPLOAD_BYTES, VARIANT_SIDES } from './image-processing';

@RequireTag('examiner')
@Controller('illustrations')
export class IllustrationsController {
  constructor(private readonly illustrations: IllustrationsService) {}

  /** multipart/form-data: một file ở trường `file`. */
  @Post()
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: AuthenticatedUser) {
    if (!req.isMultipart()) throw validationFailed('file', 'required');
    const part = await req.file({ limits: { fileSize: MAX_ILLUSTRATION_UPLOAD_BYTES, files: 1 } });
    if (!part) throw validationFailed('file', 'required');
    const content = await part.toBuffer().catch((error: { code?: string }) => {
      // Chỉ lỗi quá cỡ mới báo quá cỡ; ngắt kết nối giữa chừng hay lỗi khác thì để lỗi gốc đi tiếp.
      throw error.code === 'FST_REQ_FILE_TOO_LARGE'
        ? validationFailed('file', 'image_too_large')
        : error;
    });
    return this.illustrations.upload(user.id, content);
  }

  @Get()
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    return this.illustrations.list(user.id, pageSchema.parse(query ?? {}));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.illustrations.get(user.id, id);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.illustrations.remove(user.id, id);
  }
}

const variantSchema = z.coerce
  .number()
  .int()
  .refine((side) => (VARIANT_SIDES as readonly number[]).includes(side));

/** Gửi một biến thể ảnh: nginx đọc file qua X-Accel-Redirect ở production, dev thì api đọc từ kho. */
async function sendVariant(
  reply: FastifyReply,
  env: Env,
  media: MediaStore,
  key: string,
): Promise<unknown> {
  // Nội dung của một id không đổi nên lưu đệm lâu; `private` vì chỉ người được phép xem.
  reply
    .header('content-type', 'image/webp')
    .header('cache-control', 'private, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff');
  if (env.MEDIA_ACCEL_PREFIX) {
    reply.header('x-accel-redirect', `${env.MEDIA_ACCEL_PREFIX}/${key}`);
    return '';
  }
  return media.get(key);
}

/** Phục vụ ảnh có kiểm quyền (Q141). Production để nginx đọc file qua X-Accel-Redirect. */
@RequireTag('examiner')
@Controller('media')
export class MediaController {
  constructor(
    private readonly illustrations: IllustrationsService,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(':id/:variant')
  async serve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variant') variant: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const side = variantSchema.safeParse(variant);
    if (!side.success) throw validationFailed('variant', 'invalid');
    const key = await this.illustrations.variantKey(user.id, id, side.data);
    return sendVariant(reply, this.env, this.media, key);
  }
}

/**
 * Ảnh trong đề cho Người dự thi (Q219): chỉ khi có Lượt đang làm trên đúng thiết bị đã gắn. Quyền do cổng
 * `CANDIDATE_MEDIA` quyết định; `question-bank` không biết Lượt làm bài.
 */
@RequireTag('candidate')
@Controller('take-media')
export class CandidateMediaController {
  constructor(
    private readonly illustrations: IllustrationsService,
    @Inject(CANDIDATE_MEDIA) private readonly candidateMedia: CandidateMedia,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(':attemptId/:id/:variant')
  async serve(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variant') variant: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const side = variantSchema.safeParse(variant);
    if (!side.success) throw validationFailed('variant', 'invalid');
    const deviceKey = req.cookies?.[DEVICE_COOKIE];
    if (!(await this.candidateMedia.canView(user.id, deviceKey, attemptId, id))) {
      throw new ApiError('NOT_FOUND');
    }
    const key = await this.illustrations.variantKeyAfterAccessCheck(id, side.data);
    return sendVariant(reply, this.env, this.media, key);
  }
}

/**
 * Ảnh trong đề khi Xem thử (Q245): chỉ chủ Phiên thi, ở mọi trạng thái của Phiên thi. Quyền do cổng `CANDIDATE_MEDIA`
 * quyết định; người khác nhận 404 như khi ảnh không tồn tại.
 */
@Controller('sessions')
export class PreviewMediaController {
  constructor(
    private readonly illustrations: IllustrationsService,
    @Inject(CANDIDATE_MEDIA) private readonly candidateMedia: CandidateMedia,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(':sessionId/try-media/:id/:variant')
  async serve(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variant') variant: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const side = variantSchema.safeParse(variant);
    if (!side.success) throw validationFailed('variant', 'invalid');
    if (!(await this.candidateMedia.canPreview(user.id, sessionId, id))) {
      throw new ApiError('NOT_FOUND');
    }
    const key = await this.illustrations.variantKeyAfterAccessCheck(id, side.data);
    return sendVariant(reply, this.env, this.media, key);
  }
}
