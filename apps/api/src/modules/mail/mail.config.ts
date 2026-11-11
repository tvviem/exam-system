import type { Env } from '../../config/env';
import type { PlanLimits } from './plan-batch';

export const MAIL_LIMITS = Symbol('MAIL_LIMITS');

/** Chờ ngắn (khoảng cách 6 giây) thì chờ ngay trong lần chạy; chờ lâu hơn để lần chạy sau (cron mỗi phút) lo. */
export const MAX_INLINE_WAIT_MS = 30_000;

/** Số lần thử tối đa cho một thư gặp lỗi tạm thời, kể cả lần đầu (Q382). */
export const MAX_ATTEMPTS = 5;

/** Sai thông tin đăng nhập SMTP thì tạm dừng gửi chừng này rồi thử lại (ngắt mạch). */
export const CIRCUIT_OPEN_MS = 15 * 60_000;

/** Thư kẹt ở "đang gửi" quá chừng này thì coi như tiến trình đã chết giữa chừng (Q381). */
export const STUCK_AFTER_MS = 10 * 60_000;

/** Khóa tư vấn PostgreSQL: chỉ một tiến trình chọn thư kế tiếp tại một thời điểm. Số tùy ý nhưng cố định. */
export const DISPATCH_LOCK_KEY = 7_302_024;

export type MailTransportKind = 'smtp' | 'console' | 'none';

/**
 * Chọn adapter vận chuyển từ cấu hình. Có đủ SMTP thì dùng SMTP. Thiếu thì: dev và test in thư ra bảng điều khiển để
 * thử bằng tay; production ở chế độ "không gửi", KHÔNG BAO GIỜ in thư (thư chứa liên kết có mã) ra log.
 */
export function selectMailTransport(env: Env): MailTransportKind {
  if (env.SMTP_HOST) return 'smtp';
  return env.NODE_ENV === 'production' ? 'none' : 'console';
}

export function mailLimitsFromEnv(env: Env): PlanLimits {
  return {
    total: env.EMAIL_LIMIT_TOTAL,
    bulk: env.EMAIL_LIMIT_BULK,
    minGapMs: env.EMAIL_MIN_GAP_SECONDS * 1000,
    warmupBulk: env.EMAIL_WARMUP_BULK,
  };
}

/** Mỗi lần chạy job gửi thư không quá chừng này (theo đồng hồ), để không chiếm chỗ của worker quá lâu. */
export const DISPATCH_BUDGET_MS = 50_000;

/** Lần chạy gửi thư quá chừng này mà chưa xong thì coi là treo và cho phép lần chạy mới (hạn chờ SMTP chỉ 15 giây). */
export const DISPATCH_STUCK_MS = 5 * 60_000;
