import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "Mức xử lý Vi phạm" (Q294): `grading` đọc Vi phạm và đặt Mức xử lý mà không đọc bảng của `attempt`. `attempt` cài đặt,
 * nối ở `AttemptPortsWiringModule`.
 */
export const VIOLATION_PENALTIES = Symbol('VIOLATION_PENALTIES');

export type ViolationExecutor = Database | Transaction;

export type PenaltyType = 'none' | 'percent' | 'void';

export interface ViolationRecord {
  id: string;
  attemptId: string;
  userId: string;
  action: 'warning' | 'disqualify';
  reason: string;
  recordedAt: Date;
  penaltyType: PenaltyType;
  penaltyPercent: number | null;
  /** Lúc Người ra đề quyết Mức xử lý; `null` nghĩa là chưa quyết. */
  penaltyDecidedAt: Date | null;
}

export interface ViolationPenalties {
  /** Mọi Vi phạm của Phiên thi, cũ trước. */
  list(sessionId: string, executor?: ViolationExecutor): Promise<ViolationRecord[]>;
  /** Vi phạm của một người trong Phiên thi, cũ trước. */
  listForUser(
    sessionId: string,
    userId: string,
    executor?: ViolationExecutor,
  ): Promise<ViolationRecord[]>;
  /** Đặt Mức xử lý; trả Vi phạm sau khi đặt, hoặc `null` nếu không thuộc Phiên thi này. */
  setPenalty(
    sessionId: string,
    violationId: string,
    penalty: { type: PenaltyType; percent?: number },
    now: Date,
    executor?: ViolationExecutor,
  ): Promise<ViolationRecord | null>;
}
