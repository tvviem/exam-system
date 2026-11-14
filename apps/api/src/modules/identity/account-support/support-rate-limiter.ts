import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Mỗi sinh viên được Gửi lại tối đa 1 lần mỗi 24 giờ (Q375), dù do Người ra đề hay Quản trị viên. */
const RESEND_GAP_MS = DAY_MS;
/** Mỗi người tạo Liên kết hỗ trợ tối đa 30 lần mỗi giờ: đủ cho cả lớp thi, đủ thấp để một tài khoản bị chiếm không phát hàng loạt. */
const MAX_LINKS_PER_ACTOR_PER_HOUR = 30;

// Nguyên tử: nếu đã gửi lại trong khoảng cách thì trả mốc lần gửi trước, nếu không thì ghi mốc mới và trả 0.
const RESEND_SCRIPT = `
local last = tonumber(redis.call('GET', KEYS[1]))
if last and (tonumber(ARGV[1]) - last) < tonumber(ARGV[2]) then return last end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 0`;

export type ResendPermit = { allowed: true } | { allowed: false; allowedAt: Date };

/** Giới hạn tần suất của các thao tác hỗ trợ kích hoạt; thời gian lấy từ `Clock` nên kiểm thử tua được. */
@Injectable()
export class SupportRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async tryResend(userId: string): Promise<ResendPermit> {
    const now = this.clock.now().getTime();
    const last = Number(
      await this.redis.eval(
        RESEND_SCRIPT,
        1,
        `support:resend:${userId}`,
        String(now),
        String(RESEND_GAP_MS),
      ),
    );
    return last === 0
      ? { allowed: true }
      : { allowed: false, allowedAt: new Date(last + RESEND_GAP_MS) };
  }

  /** Trả lại lượt Gửi lại khi thao tác không xếp được thư (để người dùng thử lại). */
  async refundResend(userId: string): Promise<void> {
    await this.redis.del(`support:resend:${userId}`);
  }

  async allowLink(actorId: string): Promise<boolean> {
    const hour = Math.floor(this.clock.now().getTime() / HOUR_MS);
    const key = `support:link:${actorId}:${hour}`;
    const [incr] =
      (await this.redis
        .multi()
        .incr(key)
        .pexpire(key, 2 * HOUR_MS)
        .exec()) ?? [];
    return Number(incr?.[1] ?? 0) <= MAX_LINKS_PER_ACTOR_PER_HOUR;
  }
}
