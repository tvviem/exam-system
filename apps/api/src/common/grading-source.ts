import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "Lượt đã nộp để chấm" (Q285): `grading` đọc bài làm qua cổng này, không đọc bảng của `attempt`. `attempt` cài đặt, nối
 * ở `AttemptPortsWiringModule`.
 */
export const GRADING_SOURCE = Symbol('GRADING_SOURCE');

export type GradingExecutor = Database | Transaction;

export interface GradableAttempt {
  attemptId: string;
  sessionId: string;
  examId: string;
  userId: string;
  attemptNo: number;
  /** `value` của từng Câu trả lời đã lưu, theo `itemId`; câu không trả lời thì vắng. */
  responses: Map<string, unknown>;
}

export interface GradingSource {
  /**
   * Chỉ trả các Lượt đã nộp (id không tồn tại hoặc còn đang làm thì vắng). `lock: true` (trong giao dịch) khóa các dòng Lượt
   * `FOR SHARE` theo thứ tự `id`: Hoàn tác Buộc nộp phải chờ giao dịch chấm xong, nên không có điểm cũ đè lên bài đã mở lại.
   */
  loadSubmitted(
    attemptIds: string[],
    executor?: GradingExecutor,
    options?: { lock?: boolean },
  ): Promise<GradableAttempt[]>;
  /** Mọi Lượt đã nộp của Phiên thi (để dựng danh sách Lượt có thể được tính). */
  attemptsOfSession(
    sessionId: string,
    executor?: GradingExecutor,
  ): Promise<{ attemptId: string; userId: string; attemptNo: number; submittedAt: Date }[]>;
  /** Id các Lượt nộp từ `since`, mới nhất trước; phân trang bằng `offset`. */
  submittedSince(since: Date, limit: number, offset: number): Promise<string[]>;
}
