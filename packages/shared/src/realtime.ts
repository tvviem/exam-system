// Hợp đồng của kênh đẩy Socket.IO giữa api và trình duyệt (docs/plan/slice-4.md, PR 4d-3; Q213). Kênh chỉ là phần tăng
// tốc: mọi thay đổi vẫn đến bằng heartbeat và hỏi lại, nên kênh hỏng hay chậm thì hệ thống vẫn đúng.

/** Đường dẫn của Socket.IO: khớp `location /ws/` đã có ở nginx (kèm Upgrade) và proxy `/ws` của Vite; không dưới `/api`. */
export const REALTIME_PATH = '/ws';

/** Sự kiện server đẩy xuống. Không mang dữ liệu nghiệp vụ: trình duyệt hỏi lại REST để lấy sự thật. */
export const REALTIME_EVENT = {
  /** Phòng của Người ra đề: có thay đổi ở Phiên thi, hãy tải lại ảnh chụp. Gộp tối đa một lần mỗi 2 giây. */
  monitorChanged: 'monitor.changed',
  /** Phòng của Người dự thi: có thay đổi ở Lượt này (Cộng giờ, Buộc nộp, Cảnh cáo, Thu hồi), hãy gửi heartbeat ngay. */
  attemptNudge: 'attempt.nudge',
} as const;

/** Thông điệp trình duyệt gửi lên để vào phòng; server trả lời bằng `JoinAck`. */
export const REALTIME_JOIN = { monitor: 'monitor:join', attempt: 'attempt:join' } as const;

export interface JoinAck {
  ok: boolean;
}

/**
 * Khi kênh đẩy đang nối, vẫn hỏi lại chừng này một lần: phòng khi lỡ một tin, và vì "mất kết nối quá 45 giây", hết giờ,
 * đến `closesAt` do server tính theo thời gian chứ không có tin đẩy. 10 giây giữ độ trễ phát hiện dưới 55 giây; kênh đứt thì
 * về 5 giây.
 */
export const MONITOR_SAFETY_POLL_MS = 10_000;
/** Trình duyệt chờ ngẫu nhiên đến chừng này trước khi gửi heartbeat vì `attempt.nudge`, để Cộng giờ cả phòng không dồn 500 yêu cầu một lúc. */
export const NUDGE_JITTER_MAX_MS = 300;

/** Kênh Redis các tiến trình (api, worker) dùng để báo cho cổng Socket.IO. */
export const REALTIME_REDIS_CHANNEL = 'realtime:events';

/**
 * Mỗi Lượt bị tác động thêm chừng này mili giây vào khoảng trải heartbeat, để Cộng giờ cả phòng không dồn hàng trăm yêu cầu một
 * lúc (đo 500 người: 500 heartbeat trong 300 ms mất trung vị 1,8 giây để xử lý hết; trải 2 giây thì 250 yêu cầu mỗi giây). Một
 * người thì vẫn chỉ trải NUDGE_JITTER_MAX_MS.
 */
export const NUDGE_SPREAD_PER_ATTEMPT_MS = 4;
export const NUDGE_SPREAD_MAX_MS = 2000;

/** Khoảng trải ngẫu nhiên (ms) mà trình duyệt chờ trước khi gửi heartbeat vì tin đẩy, theo số Lượt bị tác động cùng lúc. */
export const nudgeSpreadMs = (affected: number): number =>
  Math.min(
    NUDGE_SPREAD_MAX_MS,
    Math.max(NUDGE_JITTER_MAX_MS, affected * NUDGE_SPREAD_PER_ATTEMPT_MS),
  );

export type RealtimeMessage =
  | { t: 'session'; id: string }
  | { t: 'attempt'; id: string; spread?: number };

export const sessionRoom = (sessionId: string) => `session:${sessionId}`;
export const attemptRoom = (attemptId: string) => `attempt:${attemptId}`;
