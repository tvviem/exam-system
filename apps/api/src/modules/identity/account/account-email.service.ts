import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ApiError, validationFailed } from '../../../common/api-error';
import { type Database, DB } from '../../../db/db.module';
import { MailService } from '../../mail/mail.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RecoveryRateLimiter } from '../auth-links/recovery-rate-limiter';
import { users } from '../identity.schema';
import { verifyPassword } from '../password/password-hasher';
import { findActiveUserByEmail } from '../users.repository';

/**
 * Đổi và xác thực email của chính người đăng nhập (ADR-0009, mục 3.4; quyết định 12/11/2026): cần mật khẩu hiện tại, email mới
 * không trùng tài khoản chưa Xóa, tối đa 3 lần mỗi giờ và cách nhau 60 giây; email chỉ đổi khi bấm liên kết gửi tới địa chỉ mới.
 */
@Injectable()
export class AccountEmailService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly limiter: RecoveryRateLimiter,
  ) {}

  async requestChange(
    user: AuthenticatedUser,
    currentPassword: string,
    newEmail: string,
    ip: string | null,
  ): Promise<void> {
    const row = await this.load(user.id);
    if (!(await verifyPassword(row.passwordHash, currentPassword))) {
      throw new ApiError('WRONG_CURRENT_PASSWORD');
    }
    if (row.email?.toLowerCase() === newEmail.toLowerCase()) {
      throw validationFailed('newEmail', 'same_email');
    }
    if (await findActiveUserByEmail(this.db, newEmail)) {
      throw new ApiError('CONFLICT', { field: 'email' });
    }
    await this.enqueue(user.id, newEmail, ip);
  }

  /** "Gửi thư xác thực" cho email đang lưu: chỉ khi có email và chưa xác thực. */
  async requestVerification(user: AuthenticatedUser, ip: string | null): Promise<void> {
    const row = await this.load(user.id);
    if (!row.email || row.emailVerifiedAt) throw new ApiError('INVALID_STATE');
    await this.enqueue(user.id, row.email, ip);
  }

  private async enqueue(userId: string, toEmail: string, ip: string | null): Promise<void> {
    if (!(await this.limiter.allow(`email-change:${userId}`, ip)))
      throw new ApiError('RATE_LIMITED');
    await this.mail.enqueue({ kind: 'email_change', toEmail, lane: 'urgent', userId });
  }

  private async load(userId: string) {
    const [row] = await this.db
      .select({
        email: users.email,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }
}
