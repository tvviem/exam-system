// Đồng hồ làm bài (Q242): chỉ hiển thị. Giờ còn lại tính từ `deadline` và `serverNow` do server trả, trôi theo đồng hồ
// đơn điệu của trình duyệt (`performance.now()`), nên đổi giờ máy cũng không làm lệch.

export interface ServerTime {
  /** ISO, giờ server. */
  deadline: string;
  serverNow: string;
  /** `performance.now()` lúc nhận response. */
  receivedAt: number;
}

export function remainingMs(sync: ServerTime, monotonicNow: number): number {
  return Date.parse(sync.deadline) - Date.parse(sync.serverNow) - (monotonicNow - sync.receivedAt);
}

export type Warning = 'none' | 'five' | 'one' | 'over';

/** Mốc cảnh báo: còn ≤ 5 phút, còn ≤ 1 phút, đã hết giờ. */
export function warningOf(ms: number): Warning {
  if (ms <= 0) return 'over';
  if (ms <= 60_000) return 'one';
  if (ms <= 5 * 60_000) return 'five';
  return 'none';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `mm:ss`, hoặc `h:mm:ss` từ một giờ; làm tròn lên giây để không hiện 00:00 khi còn chút ít. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
