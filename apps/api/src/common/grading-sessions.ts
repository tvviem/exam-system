import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "Phiên thi để chấm" (docs/plan/slice-5.md, PR 5b): `grading` biết chủ, Bộ đề, cách tính nhiều Lượt và Danh sách dự thi
 * của một Phiên thi mà không đọc bảng của `session`. `session` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const GRADING_SESSIONS = Symbol('GRADING_SESSIONS');

export type GradingSessionExecutor = Database | Transaction;

export interface GradingSessionInfo {
  sessionId: string;
  examId: string;
  title: string;
  ownerId: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
  attemptScoring: 'highest' | 'latest';
  entryClosedAt: Date | null;
  cancelledAt: Date | null;
  /** Cho Người dự thi xem lại đề sau Công bố (Q297). */
  reviewAfterRelease: boolean;
  /**
   * Ghi đè tỷ lệ rút của Phiên thi theo mã Phần (Q438); Phần không có thì kế thừa mặc định của Bộ đề (nằm ở nội dung Bộ đề).
   * Dùng để biết số câu và điểm tối đa mỗi Người dự thi nhận (`drawTotalsOf`).
   */
  drawOverrides: Record<string, number>;
  /** Phiên thi dùng chung Mã đề: số câu và điểm tối đa (0,01) mỗi người nhận, lấy từ chính Mã đề; `null` nếu mỗi người một bộ câu. */
  variantTotals: { count: number; maxCenti: number } | null;
}

export interface GradingSessions {
  /** Phiên thi này (của bất kỳ chủ nào), hoặc `null` nếu không có. */
  info(sessionId: string, executor?: GradingSessionExecutor): Promise<GradingSessionInfo | null>;
  /** Như `info` nhưng khóa dòng Phiên thi `FOR UPDATE` đến hết giao dịch (Công bố nối đuôi với Hoàn tác, Hủy). */
  lock(sessionId: string, executor: GradingSessionExecutor): Promise<GradingSessionInfo | null>;
  /** Đổi "Cho xem lại đề sau Công bố" (Q297); tăng `version` như mọi lần sửa thiết lập. */
  setReviewAfterRelease(
    sessionId: string,
    value: boolean,
    executor: GradingSessionExecutor,
  ): Promise<void>;
  /** Mọi Phiên thi dùng Bộ đề này (Đính chính đáp án chấm lại cho các Phiên thi chưa Chốt). */
  byExam(examId: string, executor?: GradingSessionExecutor): Promise<GradingSessionInfo[]>;
  /** Các Phiên thi có trong `sessionIds` (mới mở trước). */
  infoMany(sessionIds: string[]): Promise<GradingSessionInfo[]>;
  /** Mọi người trong Danh sách dự thi, kèm Lớp chụp lúc thêm và nhãn Mã đề (chỉ khi Phiên thi có từ hai Mã đề, Q474). */
  roster(
    sessionId: string,
    executor?: GradingSessionExecutor,
  ): Promise<{ userId: string; classLabel: string | null; variantLabel: string | null }[]>;
  isInRoster(
    sessionId: string,
    userId: string,
    executor?: GradingSessionExecutor,
  ): Promise<boolean>;
  /** Tìm Phiên thi của mọi chủ theo tên (dành cho Quản trị viên cấp Ủy quyền), mới mở trước. */
  search(q: string, limit: number): Promise<GradingSessionInfo[]>;
}
