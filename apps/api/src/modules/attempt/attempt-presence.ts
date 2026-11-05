import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module';

const log = new Logger('AttemptPresence');

/** Presence tự hết hạn nếu cả Phiên thi im lặng quá lâu (Phiên thi dài nhất là một ngày). */
const PRESENCE_TTL_MS = 24 * 3_600_000;

/**
 * Lần gần nhất mỗi Lượt báo còn làm bài (Q213), giữ ở Redis: hash `presence:{sessionId}`, trường là id Lượt, giá trị là
 * giờ server (ms). "Mất kết nối" suy ra khi đọc từ giờ này, không cần bộ đếm giờ. Mất Redis thì chỉ mất trạng thái trực
 * tuyến, không mất Câu trả lời hay hạn (ADR-0002).
 */
@Injectable()
export class AttemptPresence {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(sessionId: string) {
    return `presence:${sessionId}`;
  }

  /**
   * Ghi lần báo mới nhất và trả lần báo trước (`null` nếu chưa có hoặc Redis lỗi). Redis lỗi thì bỏ qua (chỉ mất trạng
   * thái trực tuyến, ADR-0002), không làm hỏng heartbeat.
   */
  async touch(sessionId: string, attemptId: string, now: Date): Promise<Date | null> {
    const key = this.key(sessionId);
    try {
      const results = await this.redis
        .multi()
        .hget(key, attemptId)
        .hset(key, attemptId, String(now.getTime()))
        .pexpire(key, PRESENCE_TTL_MS)
        .exec();
      const previous = results?.[0]?.[1];
      return typeof previous === 'string' ? new Date(Number(previous)) : null;
    } catch (error) {
      log.warn(`Không ghi được presence: ${String(error)}`);
      return null;
    }
  }

  /** Giờ báo gần nhất của từng Lượt trong Phiên thi (Lượt chưa từng báo vắng). Redis lỗi thì coi như chưa ai báo. */
  async lastSeenOf(sessionId: string): Promise<Map<string, Date>> {
    try {
      const all = await this.redis.hgetall(this.key(sessionId));
      return new Map(
        Object.entries(all).map(([attemptId, ms]) => [attemptId, new Date(Number(ms))]),
      );
    } catch (error) {
      log.warn(`Không đọc được presence: ${String(error)}`);
      return new Map();
    }
  }

  // --- Phòng chờ (Q284): người đã nhập mã nhưng chưa có Lượt báo còn trực tuyến, theo `userId` ---------------------------

  private waitingKey(sessionId: string) {
    return `waiting:${sessionId}`;
  }

  /** Ghi nhịp của Phòng chờ. Redis lỗi thì bỏ qua (chỉ mất trạng thái trực tuyến, ADR-0002). */
  async touchWaiting(sessionId: string, userId: string, now: Date): Promise<void> {
    const key = this.waitingKey(sessionId);
    try {
      await this.redis
        .multi()
        .hset(key, userId, String(now.getTime()))
        .pexpire(key, PRESENCE_TTL_MS)
        .exec();
    } catch (error) {
      log.warn(`Không ghi được nhịp Phòng chờ: ${String(error)}`);
    }
  }

  /** Giờ báo gần nhất của từng người trong Phòng chờ (người chưa từng báo vắng). Redis lỗi thì coi như chưa ai báo. */
  async waitingLastSeen(sessionId: string): Promise<Map<string, Date>> {
    try {
      const all = await this.redis.hgetall(this.waitingKey(sessionId));
      return new Map(Object.entries(all).map(([userId, ms]) => [userId, new Date(Number(ms))]));
    } catch (error) {
      log.warn(`Không đọc được nhịp Phòng chờ: ${String(error)}`);
      return new Map();
    }
  }
}
