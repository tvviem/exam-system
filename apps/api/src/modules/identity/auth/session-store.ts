import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { REDIS } from '../../../redis/redis.module';
import { authSessions } from '../identity.schema';
import { sessionLifetimeFor } from './session-policy';

export interface SessionRecord {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
  idleMs: number;
  ip: string | null;
  userAgent: string | null;
}

export interface SessionMeta {
  ip: string | null;
  userAgent: string | null;
}

const sessionKey = (tokenHash: string) => `auth:session:${tokenHash}`;
const userSessionsKey = (userId: string) => `auth:user-sessions:${userId}`;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Phiên đăng nhập (ADR-0004): bản ghi sống trong Redis, bản sao trong auth_sessions để tra lịch sử.
 * Thời hạn được so với Clock; TTL của Redis chỉ để dọn rác.
 */
@Injectable()
export class SessionStore {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(user: { id: string; isAdmin: boolean }, meta: SessionMeta) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const now = this.clock.now().getTime();
    const lifetime = sessionLifetimeFor(user);
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

    const record: SessionRecord = {
      sessionId: row.id,
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
  async resolve(token: string): Promise<SessionRecord | null> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.get(sessionKey(tokenHash));
    if (!raw) return null;
    const record = JSON.parse(raw) as SessionRecord;
    const now = this.clock.now().getTime();

    if (now >= record.absoluteExpiresAt || now >= record.lastSeenAt + record.idleMs) {
      await this.removeFromRedis(record.userId, tokenHash);
      await this.markRevoked(record.sessionId, 'expired');
      return null;
    }

    record.lastSeenAt = now;
    const ttl = Math.min(record.idleMs, record.absoluteExpiresAt - now);
    await this.redis.set(sessionKey(tokenHash), JSON.stringify(record), 'PX', Math.max(ttl, 1));
    return record;
  }

  async revokeToken(token: string, reason: string): Promise<void> {
    const tokenHash = hashToken(token);
    const raw = await this.redis.get(sessionKey(tokenHash));
    if (!raw) return;
    const record = JSON.parse(raw) as SessionRecord;
    await this.removeFromRedis(record.userId, tokenHash);
    await this.markRevoked(record.sessionId, reason);
  }

  /** Thu hồi mọi phiên của một người (Khóa đăng nhập, Xóa người dùng, đổi mật khẩu). */
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    for (const record of await this.listForUser(userId)) {
      if (record.sessionId === exceptSessionId) continue;
      await this.removeFromRedis(userId, record.tokenHash);
      await this.markRevoked(record.sessionId, reason);
    }
  }

  /** Thu hồi một phiên của chính người dùng; false nếu không tìm thấy phiên đó trong số phiên của họ. */
  async revokeOwnSession(userId: string, sessionId: string, reason: string): Promise<boolean> {
    const record = (await this.listForUser(userId)).find((r) => r.sessionId === sessionId);
    if (!record) return false;
    await this.removeFromRedis(userId, record.tokenHash);
    await this.markRevoked(record.sessionId, reason);
    return true;
  }

  /** Các phiên còn hiệu lực của một người, mới nhất trước. */
  async listForUser(userId: string): Promise<(SessionRecord & { tokenHash: string })[]> {
    const hashes = await this.redis.smembers(userSessionsKey(userId));
    if (hashes.length === 0) return [];
    const raws = await this.redis.mget(hashes.map(sessionKey));
    const now = this.clock.now().getTime();
    const result: (SessionRecord & { tokenHash: string })[] = [];
    for (const [i, raw] of raws.entries()) {
      const tokenHash = hashes[i] as string;
      if (!raw) {
        await this.redis.srem(userSessionsKey(userId), tokenHash);
        continue;
      }
      const record = JSON.parse(raw) as SessionRecord;
      if (now < record.absoluteExpiresAt && now < record.lastSeenAt + record.idleMs) {
        result.push({ ...record, tokenHash });
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  private async removeFromRedis(userId: string, tokenHash: string) {
    await this.redis
      .multi()
      .del(sessionKey(tokenHash))
      .srem(userSessionsKey(userId), tokenHash)
      .exec();
  }

  private async markRevoked(sessionId: string, reason: string) {
    await this.db
      .update(authSessions)
      .set({ revokedAt: this.clock.now(), revokedReason: reason })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
  }
}
