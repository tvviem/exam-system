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
  /** Cách ra đề: `shared` là dùng chung Mã đề, `per_candidate` là mỗi người một bộ câu (docs/plan/ma-de-phien-thi-thiet-ke.md). */
  drawScope: 'shared' | 'per_candidate';
  shuffleItems: boolean;
  shuffleOptions: boolean;
  showScoringRules: boolean;
  /** Phút cộng sẵn cho riêng người này. */
  extraMinutes: number;
}

/** Mã đề của một Người dự thi và bộ câu của Mã đề đó (mã câu trong Bộ đề). */
export interface EntryVariant {
  variantId: string;
  itemIds: string[];
}

/** Một Mã đề của Phiên thi `shared` kèm bộ câu đã lưu (mã câu trong Bộ đề). */
export interface EntryVariantInfo extends EntryVariant {
  number: number;
  label: string;
}

export interface SessionEntry {
  /**
   * Mã đề của người này ở Phiên thi `shared`: đã chia thì trả Mã đề đó; chưa thì gán Mã đề **đang có ít người nhất** (Q466) và
   * ghi vào Danh sách dự thi ngay trong giao dịch của bên gọi (khóa cố vấn theo Phiên thi để nhiều người vào cùng lúc vẫn chia
   * đều). `null` nếu Phiên thi không có Mã đề (`per_candidate`).
   */
  /** Số câu và điểm tối đa mỗi người nhận của các Phiên thi dùng chung Mã đề (`sessionId` → tổng; Phiên thi khác vắng). */
  variantTotalsOfMany(
    sessions: { sessionId: string; examId: string }[],
    executor?: EntryExecutor,
  ): Promise<Map<string, { count: number; maxCenti: number }>>;
  /** Mã đề của chính người này (số và nhãn), chỉ khi Phiên thi có từ hai Mã đề; ngược lại `null` (Q471). */
  variantLabelOf(
    sessionId: string,
    userId: string,
    executor?: EntryExecutor,
  ): Promise<{ number: number; label: string } | null>;
  /** Mọi Mã đề của Phiên thi theo số thứ tự, kèm bộ câu; rỗng nếu Phiên thi không có Mã đề. Để xem bộ câu và Xem thử, không gán cho ai. */
  variantsOf(sessionId: string, executor?: EntryExecutor): Promise<EntryVariantInfo[]>;
  variantFor(
    sessionId: string,
    userId: string,
    executor: EntryExecutor,
  ): Promise<EntryVariant | null>;
  /** Các Phiên thi (mới nhất trước, tối đa 20) có Mã vào thi này mà người này có trong Danh sách. `code` đã chuẩn hóa. */
  findByCode(userId: string, code: string, executor?: EntryExecutor): Promise<EntryGate[]>;
  /**
   * Phiên thi này nếu người này có trong Danh sách; ngược lại `null`. `lock: true` khóa dòng Phiên thi `FOR SHARE` đến hết
   * giao dịch: Hủy, Thu hồi, Hoàn tác Thu hồi, Bớt người đều khóa Phiên thi trước nên các thao tác nối đuôi nhau, không bế tắc.
   */
  gateFor(
    sessionId: string,
    userId: string,
    executor?: EntryExecutor,
    options?: { lock?: boolean },
  ): Promise<EntryGate | null>;
  /**
   * Phiên thi này nếu `userId` là chủ (Người ra đề tạo ra nó); ngược lại `null`. Dùng cho Xem thử (Q245): Người ra đề không
   * nằm trong Danh sách dự thi nên `gateFor` không thấy. `extraMinutes` luôn là 0.
   */
  gateForOwner(
    sessionId: string,
    userId: string,
    executor?: EntryExecutor,
  ): Promise<EntryGate | null>;
  /**
   * Ghi đè tỷ lệ rút của Phiên thi theo mã Phần (Q438); Phần không có trong kết quả thì kế thừa mặc định của Bộ đề. Phiên thi
   * đã có Lượt thì không đổi được nên đọc lúc bắt đầu Lượt là ổn định.
   */
  drawOverridesOf(sessionId: string, executor?: EntryExecutor): Promise<Record<string, number>>;
  /** Như `drawOverridesOf` cho nhiều Phiên thi một lúc: `sessionId` → ghi đè (Phiên thi không ghi đè vắng). */
  drawOverridesOfMany(
    sessionIds: string[],
    executor?: EntryExecutor,
  ): Promise<Map<string, Record<string, number>>>;
  /** Phiên thi của người này (mới nhất trước, tối đa 100), bỏ những cái đã đóng quá `since`. */
  listFor(userId: string, since: Date, executor?: EntryExecutor): Promise<EntryGate[]>;
}
