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
  /** Các Phiên thi có trong `sessionIds` (mới mở trước). */
  infoMany(sessionIds: string[]): Promise<GradingSessionInfo[]>;
  /** Mọi người trong Danh sách dự thi, kèm Lớp chụp lúc thêm. */
  roster(
    sessionId: string,
    executor?: GradingSessionExecutor,
  ): Promise<{ userId: string; classLabel: string | null }[]>;
  isInRoster(
    sessionId: string,
    userId: string,
    executor?: GradingSessionExecutor,
  ): Promise<boolean>;
  /** Tìm Phiên thi của mọi chủ theo tên (dành cho Quản trị viên cấp Ủy quyền), mới mở trước. */
  search(q: string, limit: number): Promise<GradingSessionInfo[]>;
}
