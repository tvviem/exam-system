import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env';
import { REDIS } from '../../../redis/redis.module';

const WINDOW_MS = 10 * 60_000;
/** Mỗi cặp (tên đăng nhập, IP) tối đa 10 lần thử mỗi 10 phút: kẻ tấn công chỉ làm cạn lượt của chính IP của họ. */
const MAX_PER_IDENTIFIER_AND_IP = 10;
/**
 * Trần theo tên đăng nhập trên cả hệ thống, bất kể IP: chặn đoán mật khẩu của một tài khoản từ rất nhiều IP. Đủ cao để kẻ tấn công
 * phải dùng cả mạng máy ma mới chạm tới, và chỉ đếm những lần thử đã qua giới hạn theo cặp.
 */
const MAX_PER_IDENTIFIER = 200;

/** Đếm số lần thử đăng nhập theo cửa sổ cố định 10 phút, tính theo Clock. */
@Injectable()
export class LoginRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Ghi nhận một lần thử; trả về false nếu đã vượt giới hạn theo IP, theo cặp (tên, IP) hoặc theo tên. */
  async allow(ip: string | null, identifier: string): Promise<boolean> {
    const window = Math.floor(this.clock.now().getTime() / WINDOW_MS);
    const who = identifier.toLowerCase();
    const where = ip ?? 'unknown';
    if ((await this.count(`auth:rl:ip:${where}:${window}`)) > this.env.LOGIN_MAX_PER_IP)
      return false;
    if ((await this.count(`auth:rl:pair:${who}:${where}:${window}`)) > MAX_PER_IDENTIFIER_AND_IP) {
      return false;
    }
    // Lượt đã bị chặn theo cặp không được đếm vào trần theo tên: một IP không thể tự đẩy trần cho cả hệ thống.
    return (await this.count(`auth:rl:id:${who}:${window}`)) <= MAX_PER_IDENTIFIER;
  }

  private async count(key: string): Promise<number> {
    const results = await this.redis.multi().incr(key).pexpire(key, WINDOW_MS).exec();
    return Number(results?.[0]?.[1] ?? 0);
  }
}
