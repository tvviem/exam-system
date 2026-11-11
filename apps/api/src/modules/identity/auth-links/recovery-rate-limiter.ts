import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const HOUR_MS = 3_600_000;
/** Mỗi người tối đa 3 yêu cầu mỗi giờ, cách nhau ít nhất 60 giây; mỗi IP tối đa 20 yêu cầu mỗi giờ (ADR-0009, mục 4). */
const MAX_PER_SUBJECT_PER_HOUR = 3;
const MIN_GAP_MS = 60_000;
const MAX_PER_IP_PER_HOUR = 20;

// Nguyên tử: kiểm giãn cách và hạn mức giờ của người, chỉ ghi khi cả hai đạt. Thời gian lấy từ Clock (truyền vào) nên tua được.
const SUBJECT_SCRIPT = `
local last = tonumber(redis.call('GET', KEYS[1]))
if last and (tonumber(ARGV[1]) - last) < tonumber(ARGV[2]) then return 0 end
local n = tonumber(redis.call('GET', KEYS[2]) or '0')
if n >= tonumber(ARGV[3]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[4])
redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return 1`;

/** Giới hạn tần suất của "Quên mật khẩu". Vượt giới hạn thì người gọi vẫn nhận cùng một câu trả lời (không lộ gì). */
@Injectable()
export class RecoveryRateLimiter {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `subject`: id người dùng nếu tra được, nếu không thì chuỗi đã gõ (viết thường). Lượt IP tính cả với tên không có thật. */
  async allow(subject: string, ip: string | null): Promise<boolean> {
    const now = this.clock.now().getTime();
    const hour = Math.floor(now / HOUR_MS);

    const ipKey = `recovery:rl:ip:${ip ?? 'unknown'}:${hour}`;
    const [ipCount] =
      (await this.redis
        .multi()
        .incr(ipKey)
        .pexpire(ipKey, 2 * HOUR_MS)
        .exec()) ?? [];
    if (Number(ipCount?.[1] ?? 0) > MAX_PER_IP_PER_HOUR) return false;

    const allowed = await this.redis.eval(
      SUBJECT_SCRIPT,
      2,
      `recovery:rl:last:${subject}`,
      `recovery:rl:hour:${subject}:${hour}`,
      String(now),
      String(MIN_GAP_MS),
      String(MAX_PER_SUBJECT_PER_HOUR),
      String(2 * HOUR_MS),
    );
    return allowed === 1;
  }
}
