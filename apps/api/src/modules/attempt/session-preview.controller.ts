import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import { CurrentUser } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionPreviewService } from './session-preview.service';

/**
 * Xem thử qua Phiên thi (Q245): chỉ chủ Phiên thi và còn là Người ra đề; người khác nhận 404 như khi Phiên thi không tồn
 * tại. Không dùng `@RequireTag` vì nó trả 403, cho biết đường dẫn có thật (Q251 đã duyệt 404).
 */
@Controller('sessions')
export class SessionPreviewController {
  constructor(private readonly preview: SessionPreviewService) {}

  @Get(':id/try')
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!user.roleTags.includes('examiner')) throw new ApiError('NOT_FOUND');
    return this.preview.preview(user.id, id);
  }
}
