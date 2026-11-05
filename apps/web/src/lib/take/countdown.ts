// Đếm ngược của Phòng chờ (Q284): thuần để test. Giờ còn lại tính từ đồng hồ server, không tin đồng hồ máy.

/** Đồng hồ server suy ra từ lần hỏi gần nhất: `serverNow` lúc nhận, cộng thời gian trôi theo đồng hồ đơn điệu của trình duyệt. */
export interface ServerClock {
  serverNowMs: number;
  /** `performance.now()` lúc nhận `serverNow`. */
  receivedAt: number;
}

export const serverNowOf = (clock: ServerClock, perfNow: number): number =>
  clock.serverNowMs + Math.max(0, perfNow - clock.receivedAt);

/** Còn bao lâu tới giờ mở (mili giây, không âm). */
export const remainingMs = (opensAtMs: number, nowMs: number): number =>
  Number.isFinite(opensAtMs - nowMs) ? Math.max(0, opensAtMs - nowMs) : 0;

/** "29:05" hoặc "1:02:03"; làm tròn lên giây để không hiện 00:00 khi còn chưa tới giờ. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
