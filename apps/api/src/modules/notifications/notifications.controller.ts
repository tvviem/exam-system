import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { NotificationsService } from './notifications.service';

const readSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() }).strict();

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listFor(user.id);
  }

  /** Không gửi `ids` = đánh dấu tất cả đã đọc. */
  @Post('read')
  @HttpCode(200)
  async read(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    await this.notifications.markRead(user.id, readSchema.parse(body ?? {}).ids);
    return this.notifications.listFor(user.id);
  }
}
