import type { Transaction } from '../db/db.module';

/**
 * Cổng "Lượt vừa nộp" (Q286): `attempt` báo các Lượt vừa đóng để chấm tự động chạy ở nền; `grading` cài đặt, nối ở
 * `AttemptPortsWiringModule`. Báo là cố gắng tối đa: lỡ báo thì job quét của `grading` vẫn bắt được trong vài giây.
 */
export const ATTEMPT_SUBMITTED_HOOKS = Symbol('ATTEMPT_SUBMITTED_HOOKS');

export interface AttemptSubmittedHooks {
  /** Gọi sau khi giao dịch nộp đã commit. Không ném lỗi ra ngoài. */
  onSubmitted(attemptIds: string[]): Promise<void>;
}

/**
 * Cổng "Lượt đã được chấm chưa" (Q296): Hoàn tác Buộc nộp hỏi `grading` trước khi mở lại một Lượt. `grading` cài đặt.
 * Cả hai hàm chạy trong giao dịch Hoàn tác (đã khóa các dòng Lượt).
 */
export const ATTEMPT_GRADE_GUARD = Symbol('ATTEMPT_GRADE_GUARD');

export interface AttemptGradeGuard {
  /** Tập con của `attemptIds` đã có điểm chấm tay (hoặc Phiên thi đã Công bố): các Lượt này không mở lại được. */
  gradedIds(tx: Transaction, attemptIds: string[]): Promise<Set<string>>;
  /** Xóa điểm tự động của các Lượt sắp được mở lại; nộp lại sẽ được chấm lại. */
  discard(tx: Transaction, attemptIds: string[]): Promise<void>;
}
