import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CLOCK, type Clock } from '../../../common/clock';
import { REDIS } from '../../../redis/redis.module';

const HOUR_MS = 3_600_000;
/** Mỗi người tối đa 3 yêu cầu mỗi giờ, cách nhau ít nhất 60 giây; mỗi IP tối đa 20 yêu cầu mỗi giờ (ADR-0009, mục 4). */
const MAX_PER_SUBJECT_PER_HOUR = 3;
const MIN_GAP_MS = 60_000;
const MAX_PER_IP_PER_HOUR = 20;
/**
 * Ngân sách thư ẩn danh toàn hệ thống: "Quên mật khẩu" ai cũng bấm được, nên kẻ xấu dùng nhiều IP vẫn có thể gửi thư tới nhiều
 * tài khoản thật (mã sinh viên dễ đoán) và đốt hạn mức Gmail dành cho thư khẩn (Lời mời, hỗ trợ, đổi email). Tối đa 30 thư mỗi giờ
 * và 60 thư mỗi ngày (ngày giờ Việt Nam); một lớp 300 người quên mật khẩu cùng lúc vẫn còn đường Liên kết hỗ trợ.
 */
const ANON_MAIL_PER_HOUR = 30;
const ANON_MAIL_PER_DAY = 60;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;

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

const BUDGET_SCRIPT = `
local h = tonumber(redis.call('GET', KEYS[1]) or '0')
local d = tonumber(redis.call('GET', KEYS[2]) or '0')
if h >= tonumber(ARGV[1]) or d >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1]); redis.call('PEXPIRE', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2]); redis.call('PEXPIRE', KEYS[2], ARGV[4])
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

  /**
   * Xin một suất thư ẩn danh (chỉ gọi khi sắp xếp thư thật cho một tài khoản tồn tại, nên tên không có thật không tiêu ngân sách).
   * Cả hai bộ đếm chỉ tăng khi cả hai còn chỗ, để lượt bị từ chối không làm hao ngân sách.
   */
  async allowAnonymousMail(): Promise<boolean> {
    const now = this.clock.now().getTime();
    const hour = Math.floor(now / HOUR_MS);
    const day = Math.floor((now + VN_OFFSET_MS) / DAY_MS);
    const allowed = await this.redis.eval(
      BUDGET_SCRIPT,
      2,
      `recovery:anon:hour:${hour}`,
      `recovery:anon:day:${day}`,
      String(ANON_MAIL_PER_HOUR),
      String(ANON_MAIL_PER_DAY),
      String(2 * HOUR_MS),
      String(2 * DAY_MS),
    );
    return allowed === 1;
  }
}
