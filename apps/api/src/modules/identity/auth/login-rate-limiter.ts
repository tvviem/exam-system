import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const WINDOW_MS = 10 * 60_000;
// Nới rộng cho IP vì cả lớp dùng chung Wi-Fi, tức chung một IP (docs/plan/slice-1.md).
const MAX_PER_IP = 20;
const MAX_PER_IDENTIFIER = 10;

/** Đếm số lần thử đăng nhập theo cửa sổ cố định 10 phút, tính theo Clock. */
@Injectable()
export class LoginRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Ghi nhận một lần thử; trả về false nếu đã vượt giới hạn theo IP hoặc theo định danh. */
  async allow(ip: string | null, identifier: string): Promise<boolean> {
    const window = Math.floor(this.clock.now().getTime() / WINDOW_MS);
    const ipKey = `auth:rl:ip:${ip ?? 'unknown'}:${window}`;
    const idKey = `auth:rl:id:${identifier.toLowerCase()}:${window}`;
    const results = await this.redis
      .multi()
      .incr(ipKey)
      .pexpire(ipKey, WINDOW_MS)
      .incr(idKey)
      .pexpire(idKey, WINDOW_MS)
      .exec();
    const ipCount = Number(results?.[0]?.[1] ?? 0);
    const idCount = Number(results?.[2]?.[1] ?? 0);
    return ipCount <= MAX_PER_IP && idCount <= MAX_PER_IDENTIFIER;
  }
}
