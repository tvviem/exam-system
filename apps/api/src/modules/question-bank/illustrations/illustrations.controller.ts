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
import { validationFailed } from '../../../common/api-error';
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
    const content = await part.toBuffer().catch(() => {
      throw validationFailed('file', 'file_too_large');
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
    // Nội dung của một id không đổi nên lưu đệm lâu; `private` vì chỉ chủ được xem.
    reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff');
    if (this.env.MEDIA_ACCEL_PREFIX) {
      reply.header('x-accel-redirect', `${this.env.MEDIA_ACCEL_PREFIX}/${key}`);
      return '';
    }
    return this.media.get(key);
  }
}
