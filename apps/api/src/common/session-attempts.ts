import type { Transaction } from '../db/db.module';

/**
 * Cổng "Lượt làm bài của Phiên thi" (Q228): `session` cần biết ai đã có Lượt, đóng các Lượt khi Hủy Phiên thi và thao
 * tác thiết bị của Người ra đề, nhưng không đọc bảng của `attempt`. `attempt` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const SESSION_ATTEMPTS = Symbol('SESSION_ATTEMPTS');

export type SubmitReason =
  | 'candidate'
  | 'timeout'
  | 'examiner'
  | 'disqualified'
  | 'account_locked'
  | 'session_cancelled';

export interface ExamDeviceSummary {
  userId: string;
  deviceId: string;
  status: 'active' | 'revoked';
  ip: string | null;
  userAgent: string | null;
  boundAt: Date;
  revokedAt: Date | null;
}

export interface SessionAttempts {
  /** Phiên thi đã có Lượt làm bài nào chưa (kể cả đã nộp). */
  hasAttempts(sessionId: string, executor?: Transaction): Promise<boolean>;
  /** Số Lượt của từng người trong Phiên thi (người chưa có Lượt vắng). */
  attemptCounts(sessionId: string): Promise<Map<string, number>>;
  /** Nộp mọi Lượt đang làm của Phiên thi với `reason`; trả số Lượt đã đóng. */
  closeAll(tx: Transaction, sessionId: string, reason: SubmitReason): Promise<number>;
  /** Thiết bị của từng người trong Phiên thi (người chưa gắn thiết bị vắng). */
  devicesOf(sessionId: string): Promise<Map<string, ExamDeviceSummary[]>>;
  /** Thu hồi thiết bị đang gắn của người này. Trả `false` nếu người này chưa có thiết bị đang gắn. */
  revokeDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; by: string; reason: string | null; now: Date },
  ): Promise<boolean>;
  /** Cho thiết bị đã thu hồi vào lại (thu hồi thiết bị đang gắn khác nếu có). Trả `false` nếu không có dòng đó. */
  pardonDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; deviceId: string; by: string; now: Date },
  ): Promise<boolean>;
}
