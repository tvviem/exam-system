import { VARIANT_COUNT_MAX } from '@exam/shared';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from '../../common/api-error';
import { CurrentUser } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionPreviewService } from './session-preview.service';

const tryQuerySchema = z.object({
  /** Số thứ tự Mã đề muốn xem (Phiên thi dùng chung Mã đề). */
  variant: z.coerce.number().int().min(1).max(VARIANT_COUNT_MAX).optional(),
});

/**
 * Xem thử qua Phiên thi (Q245): chỉ chủ Phiên thi và còn là Người ra đề; người khác nhận 404 như khi Phiên thi không tồn
 * tại. Không dùng `@RequireTag` vì nó trả 403, cho biết đường dẫn có thật (Q251 đã duyệt 404).
 */
@Controller('sessions')
export class SessionPreviewController {
  constructor(private readonly preview: SessionPreviewService) {}

  /** Bộ câu của từng Mã đề (tab Đề của Phiên thi): chỉ chủ Phiên thi, không có Đáp án. */
  @Get(':id/variants')
  variants(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!user.roleTags.includes('examiner')) throw new ApiError('NOT_FOUND');
    return this.preview.variants(user.id, id);
  }

  @Get(':id/try')
  view(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.roleTags.includes('examiner')) throw new ApiError('NOT_FOUND');
    return this.preview.preview(user.id, id, tryQuerySchema.parse(query).variant);
  }
}
