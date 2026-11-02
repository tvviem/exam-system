import type { SessionPhase } from '@exam/shared';

// Luật hiển thị "Phiên thi của tôi" (Q206, Q239). Nhóm và nút của mỗi dòng suy ra từ dữ liệu `GET /take/sessions`.

export interface SessionRow {
  phase: SessionPhase;
  deviceStatus: 'active' | 'revoked' | 'other' | 'none';
  inProgressAttemptId: string | null;
  attemptsUsed: number;
  maxAttempts: number;
}

export type EntryAction =
  | 'enter-code'
  | 'start'
  | 'resume'
  | 'revoked'
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
  if (row.phase === 'upcoming') return 'wait';
  if (row.attemptsUsed >= row.maxAttempts) return 'finished';
  if (row.phase === 'closed') return row.attemptsUsed > 0 ? 'finished' : 'closed';
  if (row.phase === 'entry_closed') return 'closed';
  if (row.deviceStatus === 'revoked') return 'revoked';
  return row.deviceStatus === 'active' ? 'start' : 'enter-code';
}

export type SessionGroup = 'open' | 'upcoming' | 'finished';

export function groupOf(row: SessionRow): SessionGroup {
  if (row.inProgressAttemptId) return 'open';
  if (row.phase === 'upcoming') return 'upcoming';
  if (row.phase === 'open' && row.attemptsUsed < row.maxAttempts) return 'open';
  return 'finished';
}
