import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { REDIS } from '../../redis/redis.module';

const log = new Logger('RequestRateLimiter');

/** Giới hạn lưu bài và heartbeat theo từng người (không theo IP vì cả lớp dùng chung một IP). */
export const SAVE_LIMIT = { max: 100, windowMs: 10_000 };
export const HEARTBEAT_LIMIT = { max: 30, windowMs: 10_000 };
export const WAITING_LIMIT = { max: 30, windowMs: 10_000 };

/**
 * Chặn một người gửi lưu bài hay heartbeat dồn dập (script gọi API trực tiếp, hay trình duyệt lỗi lặp vô hạn) làm server chậm
 * cho cả phòng thi. Giao diện thật gộp thao tác (chờ 300 ms, một lô đang bay) nên tối đa khoảng 3 lần lưu mỗi giây, còn
 * heartbeat 15 giây một lần; mức giới hạn cao gấp ~3 lần nhịp đó nên người thật không bao giờ chạm. Vượt thì `429 RATE_LIMITED`;
 * giao diện thử lại có chờ, không mất câu trả lời. Redis hỏng thì không chặn (ADR-0002: Redis chỉ chứa dữ liệu tạm).
 */
@Injectable()
export class RequestRateLimiter {
  private lastWarn = 0;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async hit(
    scope: 'save' | 'heartbeat' | 'waiting',
    userId: string,
    limit: { max: number; windowMs: number },
  ): Promise<void> {
    const now = this.clock.now().getTime();
    const window = Math.floor(now / limit.windowMs);
    const key = `take:rate:${scope}:${userId}:${window}`;
    let count: number;
    try {
      const result = await this.redis
        .multi()
        .incr(key)
        .pexpire(key, limit.windowMs * 2)
        .exec();
      count = Number(result?.[0]?.[1] ?? 0);
    } catch (error) {
      if (performance.now() - this.lastWarn > 30_000) {
        this.lastWarn = performance.now();
        log.warn(`Không đếm được giới hạn ${scope}: ${String(error)}`);
      }
      return;
    }
    if (count > limit.max) {
      throw new ApiError('RATE_LIMITED', {
        retryAfterMs: (window + 1) * limit.windowMs - now,
      });
    }
  }
}
