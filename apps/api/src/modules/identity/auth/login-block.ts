import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const MAX_FAILED_LOGINS = 5;
const LOGIN_BLOCK_MS = 15 * 60_000;
const DAY_MS = 24 * 3_600_000;
const failKey = (userId: string) => `auth:login-fail:${userId}`;
const blockKey = (userId: string) => `auth:login-block:${userId}`;
const where = (ip: string | null) => ip ?? 'unknown';

/**
 * Khóa tạm do đăng nhập sai (Q47): sai 5 lần liên tiếp thì chặn 15 phút. Khác với Khóa đăng nhập do Quản trị viên thực hiện.
 * Đếm và chặn theo CẶP (tài khoản, IP), không theo tài khoản: kẻ tấn công cố ý gõ sai chỉ khóa được chính IP của họ, không
 * khóa được sinh viên đang đăng nhập từ nơi khác (7d, lỗ hổng 1). Mỗi tài khoản là hai băm Redis: số lần sai và mốc hết chặn, theo IP.
 */
@Injectable()
export class LoginBlock {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async isBlocked(userId: string, ip: string | null): Promise<boolean> {
    const blockedUntil = await this.redis.hget(blockKey(userId), where(ip));
    return blockedUntil !== null && this.clock.now().getTime() < Number(blockedUntil);
  }

  /** Ghi một lần sai của cặp (tài khoản, IP); lần thứ 5 thì bắt đầu chặn cặp đó và đếm lại từ 0. */
  async registerFailure(userId: string, ip: string | null): Promise<void> {
    const count = await this.redis.hincrby(failKey(userId), where(ip), 1);
    await this.redis.pexpire(failKey(userId), DAY_MS);
    if (count < MAX_FAILED_LOGINS) return;
    const blockedUntil = this.clock.now().getTime() + LOGIN_BLOCK_MS;
    await this.redis.hset(blockKey(userId), where(ip), String(blockedUntil));
    await this.redis.pexpire(blockKey(userId), 2 * LOGIN_BLOCK_MS);
    await this.redis.hdel(failKey(userId), where(ip));
  }

  /** Đăng nhập thành công từ IP này: chỉ xóa đếm sai của cặp này, không gỡ khóa của IP khác. */
  async clearPair(userId: string, ip: string | null): Promise<void> {
    await this.redis.hdel(failKey(userId), where(ip));
    await this.redis.hdel(blockKey(userId), where(ip));
  }

  /** Cấp lại mật khẩu hay đặt lại: xóa mọi chặn và đếm của tài khoản, ở mọi IP. */
  async clear(userId: string): Promise<void> {
    await this.redis.del(failKey(userId), blockKey(userId));
  }
}
