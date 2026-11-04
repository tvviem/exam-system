import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "người này đang trong Phiên thi đang diễn ra" (Q264, Q271): `identity` hỏi trước khi Khóa đăng nhập hay Xóa người
 * dùng, nhưng không đọc bảng của `session` hay `attempt`. `session` cài đặt (dùng cổng `SESSION_ATTEMPTS` để biết
 * Lượt đang làm), nối ở `SessionUsageWiringModule`.
 */
export const LIVE_SESSION_GUARD = Symbol('LIVE_SESSION_GUARD');

export interface LiveSessionRef {
  id: string;
  title: string;
  opensAt: Date;
  closesAt: Date;
  /** Chủ của Phiên thi (Người ra đề); `identity` tự tra tên. */
  ownerId: string;
  /** Số Lượt đang làm trong Phiên thi (cả phòng). */
  inProgress: number;
  /** `owner`: người này là chủ Phiên thi; `candidate`: người này có Lượt đang làm. */
  relation: 'owner' | 'candidate';
}

export interface LiveSessionGuard {
  /**
   * Các Phiên thi đang diễn ra mà người này là chủ, hoặc đang có Lượt đang làm trong đó. Rỗng thì Khóa hay Xóa được.
   * Truyền `executor` (giao dịch của bên gọi) để đọc đúng dữ liệu sau khi đã khóa dòng người dùng.
   */
  liveSessionsOf(
    userId: string,
    executor?: Transaction | Pick<Database, 'select'>,
  ): Promise<LiveSessionRef[]>;
}
