import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const WINDOW_MS = 10 * 60_000;
// Token 256 bit nên không đoán được; giới hạn này chỉ là lớp phòng thủ thêm cho hai endpoint công khai (Q81).
const MAX_PER_IP = 30;

/** Đếm lượt gọi endpoint Lời mời công khai theo IP, cửa sổ cố định 10 phút tính theo Clock. */
@Injectable()
export class InvitationRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async allow(ip: string | null): Promise<boolean> {
    const window = Math.floor(this.clock.now().getTime() / WINDOW_MS);
    const key = `invitation:rl:ip:${ip ?? 'unknown'}:${window}`;
    const results = await this.redis.multi().incr(key).pexpire(key, WINDOW_MS).exec();
    return Number(results?.[0]?.[1] ?? 0) <= MAX_PER_IP;
  }
}
