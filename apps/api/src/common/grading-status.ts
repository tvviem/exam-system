import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "trạng thái Công bố của Phiên thi" (docs/plan/slice-5.md, PR 5c): `attempt` (danh sách Phiên thi của Người dự thi) và
 * `session` (Hủy, sửa thiết lập) biết Phiên thi đã Công bố, đã Chốt chưa mà không đọc bảng của `grading`. `grading` cài đặt,
 * nối ở `AttemptPortsWiringModule`.
 */
export const SESSION_GRADING_STATUS = Symbol('SESSION_GRADING_STATUS');

export type GradingStatusExecutor = Database | Transaction;

export interface ReleaseState {
  releasedAt: Date;
  /** Đến lúc này còn gửi Phúc khảo được; `null` khi không nhận Phúc khảo. */
  appealUntil: Date | null;
  finalizedAt: Date | null;
}

export interface SessionGradingStatus {
  /** Các Phiên thi đã Công bố trong `sessionIds` (Phiên thi chưa Công bố vắng trong kết quả). */
  releaseStates(
    sessionIds: string[],
    executor?: GradingStatusExecutor,
  ): Promise<Map<string, ReleaseState>>;
}
