import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { type Database, DB } from '../../../db/db.module';
import { REDIS } from '../../../redis/redis.module';
import { users } from '../identity.schema';

const MAX_FAILED_LOGINS = 5;
const LOGIN_BLOCK_MS = 15 * 60_000;
const blockKey = (userId: string) => `auth:login-block:${userId}`;

/**
 * Khóa tạm do đăng nhập sai (Q47): sai 5 lần liên tiếp thì chặn 15 phút. Khác với Khóa đăng nhập
 * do Quản trị viên thực hiện. Đếm ở users.failed_login_count, mốc hết chặn ở Redis.
 */
@Injectable()
export class LoginBlock {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async isBlocked(userId: string): Promise<boolean> {
    const blockedUntil = await this.redis.get(blockKey(userId));
    return blockedUntil !== null && this.clock.now().getTime() < Number(blockedUntil);
  }

  /** Ghi một lần sai; lần thứ 5 thì bắt đầu chặn và đếm lại từ 0 cho lượt sau. */
  async registerFailure(userId: string): Promise<void> {
    const [row] = await this.db
      .update(users)
      .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
      .where(eq(users.id, userId))
      .returning({ count: users.failedLoginCount });
    if (!row || row.count < MAX_FAILED_LOGINS) return;

    const blockedUntil = this.clock.now().getTime() + LOGIN_BLOCK_MS;
    await this.redis.set(blockKey(userId), String(blockedUntil), 'PX', LOGIN_BLOCK_MS);
    await this.db.update(users).set({ failedLoginCount: 0 }).where(eq(users.id, userId));
  }

  /** Đăng nhập thành công, hoặc được cấp lại mật khẩu tạm: xóa chặn và đếm lại từ 0. */
  async clear(userId: string): Promise<void> {
    await this.redis.del(blockKey(userId));
    await this.db.update(users).set({ failedLoginCount: 0 }).where(eq(users.id, userId));
  }
}
