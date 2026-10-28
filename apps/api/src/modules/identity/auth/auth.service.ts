import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { REDIS } from '../../../redis/redis.module';
import { loginEvents, users } from '../identity.schema';
import { hashPassword, verifyPassword } from '../password/password-hasher';
import { checkPasswordPolicy } from '../password/password-policy';
import { UsersRepository } from '../users.repository';
import type { AuthenticatedUser } from './auth.types';
import { AuthError, type AuthErrorCode } from './auth-error';
import { LoginRateLimiter } from './login-rate-limiter';
import { type SessionMeta, SessionStore } from './session-store';

const MAX_FAILED_LOGINS = 5;
const LOGIN_BLOCK_MS = 15 * 60_000;
const loginBlockKey = (userId: string) => `auth:login-block:${userId}`;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly usersRepo: UsersRepository,
    private readonly sessions: SessionStore,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async login(identifier: string, password: string, meta: SessionMeta) {
    const tried = identifier.trim();
    if (!(await this.rateLimiter.allow(meta.ip, tried))) {
      await this.recordLogin({
        userId: null,
        tried,
        success: false,
        failureReason: 'RATE_LIMITED',
        meta,
      });
      throw new AuthError('RATE_LIMITED');
    }
    const user = await this.usersRepo.findActiveByIdentifier(tried);
    const fail = async (code: AuthErrorCode): Promise<never> => {
      await this.recordLogin({
        userId: user?.id ?? null,
        tried,
        success: false,
        failureReason: code,
        meta,
      });
      throw new AuthError(code);
    };

    if (user && (await this.isBlocked(user.id))) return fail('LOGIN_TEMPORARILY_BLOCKED');

    const passwordOk = await verifyPassword(user?.passwordHash ?? null, password);
    if (!user) return fail('INVALID_CREDENTIALS');
    if (!passwordOk) {
      await this.registerFailure(user.id);
      return fail('INVALID_CREDENTIALS');
    }
    if (user.status === 'locked') return fail('ACCOUNT_LOCKED');
    if (user.passwordExpiresAt && this.clock.now() >= user.passwordExpiresAt) {
      return fail('TEMPORARY_PASSWORD_EXPIRED');
    }

    await this.db
      .update(users)
      .set({ failedLoginCount: 0, lastLoginAt: this.clock.now() })
      .where(eq(users.id, user.id));
    const session = await this.sessions.create(user, meta);
    await this.recordLogin({ userId: user.id, tried, success: true, failureReason: null, meta });
    return { token: session.token, maxAgeSeconds: session.maxAgeSeconds };
  }

  async changePassword(
    user: AuthenticatedUser,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const row = await this.usersRepo.findById(user.id);
    if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
      throw new AuthError('WRONG_CURRENT_PASSWORD');
    }
    const violations = checkPasswordPolicy(newPassword, user);
    if (violations.length > 0) throw new AuthError('PASSWORD_POLICY', { violations });

    await this.db
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordExpiresAt: null,
      })
      .where(eq(users.id, user.id));
    await this.sessions.revokeAllForUser(user.id, 'password_changed', sessionId);
  }

  private async isBlocked(userId: string): Promise<boolean> {
    const blockedUntil = await this.redis.get(loginBlockKey(userId));
    return blockedUntil !== null && this.clock.now().getTime() < Number(blockedUntil);
  }

  /** Sai lần thứ 5 liên tiếp: chặn 15 phút (Q47) và đếm lại từ 0 cho lượt sau. */
  private async registerFailure(userId: string): Promise<void> {
    const [row] = await this.db
      .update(users)
      .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
      .where(eq(users.id, userId))
      .returning({ count: users.failedLoginCount });
    if (!row || row.count < MAX_FAILED_LOGINS) return;

    const blockedUntil = this.clock.now().getTime() + LOGIN_BLOCK_MS;
    await this.redis.set(loginBlockKey(userId), String(blockedUntil), 'PX', LOGIN_BLOCK_MS);
    await this.db.update(users).set({ failedLoginCount: 0 }).where(eq(users.id, userId));
  }

  private async recordLogin(event: {
    userId: string | null;
    tried: string;
    success: boolean;
    failureReason: string | null;
    meta: SessionMeta;
  }): Promise<void> {
    await this.db.insert(loginEvents).values({
      userId: event.userId,
      identifierTried: event.tried.slice(0, 320),
      success: event.success,
      failureReason: event.failureReason,
      ip: event.meta.ip,
      userAgent: event.meta.userAgent,
      at: this.clock.now(),
    });
  }
}
