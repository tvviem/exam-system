import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../../common/actor';
import { CurrentActor, CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccountSupportService } from './account-support.service';

const idSchema = z.uuid();
const reason = z.string().trim().min(1).max(500);
const emailSchema = z.object({ email: z.email().max(320), reason }).strict();
const linkSchema = z.object({ reason }).strict();

/**
 * Hỗ trợ kích hoạt (7d-1). Quyền của từng người nằm trong `AccountSupportService` (Quản trị viên: mọi tài khoản; Người ra đề: sinh viên
 * Chờ kích hoạt của mình), nên controller không giới hạn theo vai trò ở đây.
 */
@Controller('account-support')
export class AccountSupportController {
  constructor(private readonly support: AccountSupportService) {}

  @Post(':userId/resend')
  @HttpCode(200)
  async resend(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
  ) {
    await this.support.resend(user, actor, idSchema.parse(userId));
    return { ok: true };
  }

  @Post(':userId/email')
  @HttpCode(200)
  async changeEmail(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
  ) {
    await this.support.changeEmail(user, actor, idSchema.parse(userId), emailSchema.parse(body));
    return { ok: true };
  }

  @Post(':userId/link')
  async createLink(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentActor() actor: Actor,
  ) {
    const { reason } = linkSchema.parse(body);
    return this.support.createLink(user, actor, idSchema.parse(userId), reason);
  }
}
