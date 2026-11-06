// Luật thuần của Hoàn tác Buộc nộp (docs/plan/slice-4.md, Q273–Q280), dùng chung cho api và web.

/** Cửa sổ hoàn tác kể từ lúc bị Buộc nộp (Q274). */
export const UNDO_FORCE_SUBMIT_WINDOW_MS = 10 * 60_000;
/** Màn "Đã nộp" của Người dự thi bị Buộc nộp tiếp tục hỏi lại chừng này, dài hơn cửa sổ để bắt kịp lúc hoàn tác (Q279). */
export const UNDO_WATCH_MS = 15 * 60_000;

/** Lý do không hoàn tác được (Q276); khớp `reason` của lỗi `409 INVALID_STATE`. */
export const UNDO_PROBLEMS = [
  'NOT_FORCE_SUBMITTED',
  'SESSION_CANCELLED',
  'NEW_ATTEMPT_STARTED',
  'ATTEMPT_EXPIRED',
  'UNDO_WINDOW_PASSED',
  /** Đã có điểm chấm tay của Lượt, hoặc Phiên thi đã Công bố (Q296). */
  'ALREADY_GRADED',
] as const;
export type UndoProblem = (typeof UNDO_PROBLEMS)[number];

/** Hết cửa sổ hoàn tác lúc nào; đúng thời điểm này vẫn còn hoàn tác được. */
export const undoUntilOf = (submittedAt: Date): Date =>
  new Date(submittedAt.getTime() + UNDO_FORCE_SUBMIT_WINDOW_MS);

/**
 * Hạn mới của Lượt (Q275): lúc hoàn tác cộng phần thời gian còn lại lúc bị nộp. Phiên thi Cắt cứng thì không vượt giờ đóng
 * (nhưng không thấp hơn hạn cũ). `null` khi Lượt đã quá hạn lúc bị nộp, hoặc hạn mới đã qua (không còn thời gian để làm).
 */
export function undoDeadlineOf(input: {
  submittedAt: Date;
  deadline: Date;
  now: Date;
  hardClose: boolean;
  closesAt: Date;
}): Date | null {
  const remaining = input.deadline.getTime() - input.submittedAt.getTime();
  if (remaining <= 0) return null;
  const wanted = input.now.getTime() + remaining;
  // Cắt cứng: không vượt giờ đóng, nhưng cũng không thấp hơn hạn cũ (hạn cũ có thể đã vượt giờ đóng nhờ Cộng giờ, và
  // trigger `attempts_guard` không cho rút ngắn hạn).
  const capped = input.hardClose
    ? Math.max(Math.min(wanted, input.closesAt.getTime()), input.deadline.getTime())
    : wanted;
  return capped > input.now.getTime() ? new Date(capped) : null;
}

/** Vấn đề đầu tiên chặn hoàn tác (theo thứ tự ưu tiên của Q276), `null` nếu hoàn tác được. */
export function undoProblemOf(input: {
  status: 'in_progress' | 'submitted';
  submitReason: string | null;
  submittedAt: Date | null;
  deadline: Date;
  now: Date;
  sessionCancelled: boolean;
  hasNewerAttempt: boolean;
}): UndoProblem | null {
  if (input.status !== 'submitted' || input.submitReason !== 'examiner' || !input.submittedAt) {
    return 'NOT_FORCE_SUBMITTED';
  }
  if (input.sessionCancelled) return 'SESSION_CANCELLED';
  if (input.hasNewerAttempt) return 'NEW_ATTEMPT_STARTED';
  if (input.deadline.getTime() <= input.submittedAt.getTime()) return 'ATTEMPT_EXPIRED';
  if (input.now.getTime() > undoUntilOf(input.submittedAt).getTime()) return 'UNDO_WINDOW_PASSED';
  return null;
}
