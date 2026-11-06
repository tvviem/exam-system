import type { SessionPhase } from './session.js';

// Luật thuần của Phòng chờ (docs/plan/slice-4.md, Q284), dùng chung cho api và web.

/** Cho vào Phòng chờ từ chừng này trước giờ mở Phiên thi. */
export const WAITING_ROOM_WINDOW_MS = 30 * 60_000;
/** Màn chờ gửi nhịp báo còn trực tuyến chừng này một lần (cùng nhịp heartbeat khi làm bài). */
export const WAITING_PING_MS = 15_000;
/** Mất nhịp quá chừng này là mất kết nối (cùng ngưỡng 45 giây của Lượt đang làm). */
export const WAITING_OFFLINE_MS = 45_000;

/** Giờ bắt đầu cho vào Phòng chờ. */
export const waitingRoomOpensAt = (opensAt: Date): Date =>
  new Date(opensAt.getTime() - WAITING_ROOM_WINDOW_MS);

/** Nhập đúng Mã vào thi lúc này thì vào Phòng chờ (thay vì bị từ chối "chưa mở")? Chỉ khi Phiên thi sắp mở và đã trong cửa sổ. */
export const canEnterWaitingRoom = (phase: SessionPhase, opensAt: Date, now: Date): boolean =>
  phase === 'upcoming' && now.getTime() >= waitingRoomOpensAt(opensAt).getTime();

export type WaitingState = 'none' | 'online' | 'offline';

/**
 * Trạng thái của người trong Danh sách dự thi chưa có Lượt: `none` là chưa nhập mã (chưa có thiết bị); đã nhập mã thì `online`
 * khi còn nhịp trong 45 giây, ngược lại `offline` (kể cả chưa có nhịp nào).
 */
export function waitingStateOf(input: {
  joined: boolean;
  lastSeenAt: Date | null;
  now: Date;
}): WaitingState {
  if (!input.joined) return 'none';
  if (!input.lastSeenAt) return 'offline';
  return input.now.getTime() - input.lastSeenAt.getTime() <= WAITING_OFFLINE_MS
    ? 'online'
    : 'offline';
}
