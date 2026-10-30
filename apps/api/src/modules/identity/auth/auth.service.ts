import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError, type ApiErrorCode } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { loginEvents, users } from '../identity.schema';
import { hashPassword, verifyPassword } from '../password/password-hasher';
import { checkPasswordPolicy } from '../password/password-policy';
import { UsersRepository } from '../users.repository';
import type { AuthenticatedUser } from './auth.types';
import { type AuthSessionMeta, AuthSessionStore } from './auth-session-store';
import { LoginBlock } from './login-block';
import { LoginRateLimiter } from './login-rate-limiter';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly usersRepo: UsersRepository,
    private readonly authSessions: AuthSessionStore,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly loginBlock: LoginBlock,
    private readonly audit: AuditService,
  ) {}

  async login(rawIdentifier: string, password: string, meta: AuthSessionMeta) {
    const identifier = rawIdentifier.trim();
    if (!(await this.rateLimiter.allow(meta.ip, identifier))) {
      await this.recordLogin({ userId: null, identifier, failureReason: 'RATE_LIMITED', meta });
      throw new ApiError('RATE_LIMITED');
    }
    const user = await this.usersRepo.findActiveByIdentifier(identifier);
    const fail = async (code: ApiErrorCode): Promise<never> => {
      await this.recordLogin({ userId: user?.id ?? null, identifier, failureReason: code, meta });
      throw new ApiError(code);
    };

    // Luôn chạy Argon2 và chỉ báo bị chặn khi mật khẩu đúng: sai mật khẩu thì mọi trường hợp đều trả cùng
    // một lỗi, nên không dò được tài khoản nào tồn tại qua thời gian phản hồi hay mã lỗi.
    const passwordOk = await verifyPassword(user?.passwordHash ?? null, password);
    if (!user) return fail('INVALID_CREDENTIALS');
    const blocked = await this.loginBlock.isBlocked(user.id);
    if (!passwordOk) {
      if (!blocked) await this.loginBlock.registerFailure(user.id);
      return fail('INVALID_CREDENTIALS');
    }
    if (blocked) return fail('LOGIN_TEMPORARILY_BLOCKED');
    if (user.status === 'locked') return fail('ACCOUNT_LOCKED');
    if (user.passwordExpiresAt && this.clock.now() >= user.passwordExpiresAt) {
      return fail('TEMPORARY_PASSWORD_EXPIRED');
    }

    await this.loginBlock.clear(user.id);
    return this.startSession(user, identifier, meta);
  }

  /** Mở Phiên đăng nhập cho người đã được xác thực bằng cách khác (mật khẩu hoặc nhận Lời mời). */
  async startSession(
    user: { id: string; isAdmin: boolean },
    identifier: string,
    meta: AuthSessionMeta,
  ) {
    await this.db.update(users).set({ lastLoginAt: this.clock.now() }).where(eq(users.id, user.id));
    const session = await this.authSessions.create(user, meta);
    await this.recordLogin({ userId: user.id, identifier, failureReason: null, meta });
    return { token: session.token, maxAgeSeconds: session.maxAgeSeconds };
  }

  async changePassword(
    user: AuthenticatedUser,
    authSessionId: string,
    currentPassword: string,
    newPassword: string,
    actor: Actor,
  ) {
    const row = await this.usersRepo.findById(user.id);
    if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
      throw new ApiError('WRONG_CURRENT_PASSWORD');
    }
    const violations = checkPasswordPolicy(newPassword, user);
    if (violations.length > 0) throw new ApiError('PASSWORD_POLICY', { violations });

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          passwordExpiresAt: null,
        })
        .where(eq(users.id, user.id));
      // Chỉ ghi việc đã đổi, tuyệt đối không ghi mật khẩu.
      await this.audit.record(
        { actor, action: 'account.change-password', entityType: 'user', entityId: user.id },
        tx,
      );
    });
    await this.authSessions.revokeAllForUser(user.id, 'password_changed', authSessionId);
  }

  /** Ghi lịch sử đăng nhập; `failureReason` null nghĩa là thành công. */
  private async recordLogin(event: {
    userId: string | null;
    identifier: string;
    failureReason: ApiErrorCode | null;
    meta: AuthSessionMeta;
  }): Promise<void> {
    await this.db.insert(loginEvents).values({
      userId: event.userId,
      identifierTried: event.identifier.slice(0, 320),
      success: event.failureReason === null,
      failureReason: event.failureReason,
      ip: event.meta.ip,
      userAgent: event.meta.userAgent,
      at: this.clock.now(),
    });
  }
}
