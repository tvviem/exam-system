import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { REDIS } from '../../../redis/redis.module';
import { authSessions } from '../identity.schema';
import { authSessionLifetimeFor } from './auth-session-policy';

export interface AuthSessionRecord {
  authSessionId: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
  idleMs: number;
  ip: string | null;
  userAgent: string | null;
}

export interface AuthSessionMeta {
  ip: string | null;
  userAgent: string | null;
}

export type AuthSessionRevokeReason =
  | 'logout'
  | 'logout_by_user'
  | 'expired'
  | 'user_locked'
  | 'user_removed'
  | 'password_changed'
  | 'admin_recovered'
  | 'password_reissued'
  | 'password_reset';

type StoredAuthSession = AuthSessionRecord & { tokenHash: string };

const isExpired = (record: AuthSessionRecord, now: number) =>
  now >= record.absoluteExpiresAt || now >= record.lastSeenAt + record.idleMs;

const sessionKey = (tokenHash: string) => `auth:session:${tokenHash}`;
const userSessionsKey = (userId: string) => `auth:user-sessions:${userId}`;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Phiên đăng nhập (ADR-0004): bản ghi sống trong Redis, bản sao trong auth_sessions để tra lịch sử.
 * Thời hạn được so với Clock; TTL của Redis chỉ để dọn rác.
 */
@Injectable()
export class AuthSessionStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(user: { id: string; isAdmin: boolean }, meta: AuthSessionMeta) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const now = this.clock.now().getTime();
    const lifetime = authSessionLifetimeFor(user);
    const absoluteExpiresAt = now + lifetime.absoluteMs;

    const [row] = await this.db
      .insert(authSessions)
      .values({
        userId: user.id,
        tokenHash,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(absoluteExpiresAt),
      })
      .returning({ id: authSessions.id });
    if (!row) throw new Error('Không tạo được phiên đăng nhập');

    const record: AuthSessionRecord = {
      authSessionId: row.id,
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt,
      idleMs: lifetime.idleMs,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    await this.redis
      .multi()
      .set(sessionKey(tokenHash), JSON.stringify(record), 'PX', lifetime.idleMs)
      .sadd(userSessionsKey(user.id), tokenHash)
      .exec();
    return { token, maxAgeSeconds: Math.floor(lifetime.absoluteMs / 1000), record };
  }

  /** Trả về phiên còn hiệu lực và gia hạn thời gian không hoạt động; hết hạn thì thu hồi. */
  async resolve(token: string): Promise<AuthSessionRecord | null> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.get(sessionKey(tokenHash));
    if (!raw) return null;
    const record = JSON.parse(raw) as AuthSessionRecord;
    const now = this.clock.now().getTime();

    if (isExpired(record, now)) {
      await this.revoke({ ...record, tokenHash }, 'expired');
      return null;
    }

    record.lastSeenAt = now;
    const ttl = Math.min(record.idleMs, record.absoluteExpiresAt - now);
    await this.redis.set(sessionKey(tokenHash), JSON.stringify(record), 'PX', Math.max(ttl, 1));
    return record;
  }

  async revokeToken(token: string, reason: AuthSessionRevokeReason): Promise<void> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.get(sessionKey(tokenHash));
    if (raw) await this.revoke({ ...(JSON.parse(raw) as AuthSessionRecord), tokenHash }, reason);
  }

  /** Thu hồi mọi phiên của một người (Khóa đăng nhập, Xóa người dùng, đổi mật khẩu). */
  async revokeAllForUser(
    userId: string,
    reason: AuthSessionRevokeReason,
    exceptSessionId?: string,
  ): Promise<void> {
    for (const record of await this.listForUser(userId)) {
      if (record.authSessionId !== exceptSessionId) await this.revoke(record, reason);
    }
  }

  /** Thu hồi một phiên của chính người dùng; false nếu không tìm thấy phiên đó trong số phiên của họ. */
  async revokeOwnAuthSession(userId: string, authSessionId: string): Promise<boolean> {
    const record = (await this.listForUser(userId)).find((r) => r.authSessionId === authSessionId);
    if (!record) return false;
    await this.revoke(record, 'logout_by_user');
    return true;
  }

  /** Các phiên còn hiệu lực của một người, mới nhất trước. */
  async listForUser(userId: string): Promise<StoredAuthSession[]> {
    const hashes = await this.redis.smembers(userSessionsKey(userId));
    if (hashes.length === 0) return [];
    const raws = await this.redis.mget(hashes.map(sessionKey));
    const now = this.clock.now().getTime();
    const result: StoredAuthSession[] = [];
    for (const [i, raw] of raws.entries()) {
      const tokenHash = hashes[i] as string;
      if (!raw) {
        await this.redis.srem(userSessionsKey(userId), tokenHash);
        continue;
      }
      const record = JSON.parse(raw) as AuthSessionRecord;
      if (!isExpired(record, now)) result.push({ ...record, tokenHash });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Xóa phiên khỏi Redis và ghi lý do thu hồi vào bản sao trong PostgreSQL. */
  private async revoke(record: StoredAuthSession, reason: AuthSessionRevokeReason) {
    await this.redis
      .multi()
      .del(sessionKey(record.tokenHash))
      .srem(userSessionsKey(record.userId), record.tokenHash)
      .exec();
    await this.db
      .update(authSessions)
      .set({ revokedAt: this.clock.now(), revokedReason: reason })
      .where(and(eq(authSessions.id, record.authSessionId), isNull(authSessions.revokedAt)));
  }
}
