import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "vào Phiên thi" (Q223, Q228): `attempt` cần biết người này được vào Phiên thi nào và theo thiết lập nào, nhưng
 * không đọc bảng của `session`. `session` cài đặt (một truy vấn nối Phiên thi với Danh sách dự thi), nối ở
 * `AttemptPortsWiringModule`.
 */
export const SESSION_ENTRY = Symbol('SESSION_ENTRY');

export type EntryExecutor = Database | Transaction;

/** Phiên thi như Người dự thi trong Danh sách thấy, kèm giờ cộng sẵn của riêng người đó. */
export interface EntryGate {
  sessionId: string;
  examId: string;
  title: string;
  opensAt: Date;
  closesAt: Date;
  entryClosedAt: Date | null;
  cancelledAt: Date | null;
  durationMinutes: number;
  hardClose: boolean;
  maxAttempts: number;
  shuffleItems: boolean;
  shuffleOptions: boolean;
  showScoringRules: boolean;
  /** Phút cộng sẵn cho riêng người này. */
  extraMinutes: number;
}

export interface SessionEntry {
  /** Các Phiên thi (mới nhất trước, tối đa 20) có Mã vào thi này mà người này có trong Danh sách. `code` đã chuẩn hóa. */
  findByCode(userId: string, code: string, executor?: EntryExecutor): Promise<EntryGate[]>;
  /**
   * Phiên thi này nếu người này có trong Danh sách; ngược lại `null`. `lock: true` khóa dòng Phiên thi `FOR SHARE` đến hết
   * giao dịch: Hủy, Thu hồi, Cho vào lại, Bớt người đều khóa Phiên thi trước nên các thao tác nối đuôi nhau, không bế tắc.
   */
  gateFor(
    sessionId: string,
    userId: string,
    executor?: EntryExecutor,
    options?: { lock?: boolean },
  ): Promise<EntryGate | null>;
  /** Phiên thi của người này (mới nhất trước, tối đa 100), bỏ những cái đã đóng quá `since`. */
  listFor(userId: string, since: Date, executor?: EntryExecutor): Promise<EntryGate[]>;
}
