import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../identity/auth/auth.decorators';
import type { AuthenticatedUser } from '../identity/auth/auth.types';
import { MailQuotaService } from './mail-quota.service';

/** Khung hạn mức của Người ra đề và Quản trị viên (7d-2). */
@Controller('account-support')
export class MailQuotaController {
  constructor(private readonly quota: MailQuotaService) {}

  @Get('quota')
  quotaFor(@CurrentUser() user: AuthenticatedUser) {
    if (!user.isAdmin && !user.roleTags.includes('examiner')) throw new ForbiddenException();
    return this.quota.snapshot(user.id);
  }
}

@AdminOnly()
@Controller('admin/mail-queue')
export class MailQueueController {
  constructor(private readonly quota: MailQuotaService) {}

  @Get()
  queue() {
    return this.quota.adminQueue();
  }
}
