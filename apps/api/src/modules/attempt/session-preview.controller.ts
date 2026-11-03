import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { SessionPreviewService } from './session-preview.service';

/** Xem thử qua Phiên thi (Q245): chỉ chủ Phiên thi; người khác nhận 404 như khi Phiên thi không tồn tại. */
@Controller('sessions')
export class SessionPreviewController {
  constructor(private readonly preview: SessionPreviewService) {}

  @Get(':id/try')
  view(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.preview.preview(user.id, id);
  }
}
