import type { SessionPhase } from '@exam/shared';

// Luật hiển thị "Phiên thi của tôi" (Q206, Q239). Nhóm và nút của mỗi dòng suy ra từ dữ liệu `GET /take/sessions`.

export interface SessionRow {
  phase: SessionPhase;
  deviceStatus: 'active' | 'revoked' | 'other' | 'none';
  inProgressAttemptId: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  /** Đã trong cửa sổ Phòng chờ (30 phút trước giờ mở): nhập mã được (Q284). */
  canWait: boolean;
  /** Đã nhập mã trên thiết bị này và đang chờ giờ mở. */
  waitingRoom: boolean;
}

export type EntryAction =
  | 'enter-code'
  | 'start'
  | 'resume'
  | 'revoked'
  | 'waiting'
  | 'wait'
  | 'closed'
  | 'finished';

/** Mã vào thi: bỏ khoảng trắng và gạch nối, viết hoa; không tự sửa chính tả. */
export const normalizeCode = (input: string) => input.replace(/[\s-]+/g, '').toUpperCase();

export function entryActionOf(row: SessionRow): EntryAction {
  if (row.inProgressAttemptId) {
    if (row.deviceStatus === 'active') return 'resume';
    return row.deviceStatus === 'revoked' ? 'revoked' : 'enter-code';
  }
  if (row.phase === 'cancelled') return 'closed';
  if (row.phase === 'upcoming') {
    if (row.waitingRoom) return 'waiting';
    return row.canWait ? 'enter-code' : 'wait';
  }
  if (row.attemptsUsed >= row.maxAttempts) return 'finished';
  if (row.phase === 'closed') return row.attemptsUsed > 0 ? 'finished' : 'closed';
  if (row.phase === 'entry_closed') return 'closed';
  if (row.deviceStatus === 'revoked') return 'revoked';
  return row.deviceStatus === 'active' ? 'start' : 'enter-code';
}

/**
 * Sau đăng nhập: nếu Người dự thi đang có đúng một Lượt đang làm thì vào thẳng Lượt đó; không thì nếu đang ở đúng một Phòng chờ
 * thì về Phòng chờ đó (Q283/Q284). Nhiều hơn một, hoặc không có, thì để họ chọn trong "Phiên thi của tôi".
 */
export function resumeTargetOf(
  rows: readonly (SessionRow & { sessionId: string })[],
): { kind: 'attempt'; attemptId: string } | { kind: 'session'; sessionId: string } | null {
  const running = rows.filter((row) => row.inProgressAttemptId !== null);
  if (running.length > 0) {
    const [only] = running;
    return running.length === 1 && only?.inProgressAttemptId
      ? { kind: 'attempt', attemptId: only.inProgressAttemptId }
      : null;
  }
  const waiting = rows.filter((row) => groupOf(row) === 'waiting');
  const [only] = waiting;
  return waiting.length === 1 && only ? { kind: 'session', sessionId: only.sessionId } : null;
}

export type SessionGroup = 'waiting' | 'open' | 'upcoming' | 'finished';

export function groupOf(row: SessionRow): SessionGroup {
  if (row.inProgressAttemptId) return 'open';
  if (row.phase === 'upcoming') return row.waitingRoom ? 'waiting' : 'upcoming';
  if (row.phase === 'open' && row.attemptsUsed < row.maxAttempts) return 'open';
  return 'finished';
}
