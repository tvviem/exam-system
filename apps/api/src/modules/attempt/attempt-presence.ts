import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../../redis/redis.module';

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

  async touch(sessionId: string, attemptId: string, now: Date): Promise<void> {
    const key = this.key(sessionId);
    await this.redis
      .multi()
      .hset(key, attemptId, String(now.getTime()))
      .pexpire(key, PRESENCE_TTL_MS)
      .exec();
  }

  /** Giờ báo gần nhất của từng Lượt trong Phiên thi (Lượt chưa từng báo vắng). */
  async lastSeenOf(sessionId: string): Promise<Map<string, Date>> {
    const all = await this.redis.hgetall(this.key(sessionId));
    return new Map(Object.entries(all).map(([attemptId, ms]) => [attemptId, new Date(Number(ms))]));
  }
}
