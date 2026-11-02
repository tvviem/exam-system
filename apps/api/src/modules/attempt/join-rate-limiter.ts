import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../common/clock';
import { REDIS } from '../../redis/redis.module';

const WINDOW_MS = 10 * 60_000;
/** Sai quá số lần này trong 10 phút thì bị chặn tạm (Q201). */
const MAX_FAILURES = 5;

/** Đếm lần nhập sai Mã vào thi theo từng người (không theo IP vì cả lớp dùng chung một IP). */
@Injectable()
export class JoinRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private key(userId: string) {
    return `take:join:fail:${userId}:${Math.floor(this.clock.now().getTime() / WINDOW_MS)}`;
  }

  async isBlocked(userId: string): Promise<boolean> {
    return Number((await this.redis.get(this.key(userId))) ?? 0) >= MAX_FAILURES;
  }

  async recordFailure(userId: string): Promise<void> {
    const key = this.key(userId);
    await this.redis.multi().incr(key).pexpire(key, WINDOW_MS).exec();
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
