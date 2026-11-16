/**
 * Cổng "phạm vi Danh sách dự thi" (Q384): `identity` hỏi người dùng có trong Danh sách dự thi của một Phiên thi chưa kết
 * thúc của Người ra đề này không, mà không đọc bảng của `session`. `session` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const SUPPORT_ROSTER_SCOPE = Symbol('SUPPORT_ROSTER_SCOPE');

export interface SupportRosterScope {
  /** `userId` nằm trong Danh sách dự thi của một Phiên thi chưa hủy và chưa hết Khung giờ do `examinerId` làm chủ. */
  isInOpenRosterOf(examinerId: string, userId: string): Promise<boolean>;

  /** Như `isInOpenRosterOf` cho nhiều người một lần: tập hợp những người nằm trong Danh sách dự thi chưa kết thúc của `examinerId`. */
  inOpenRosterAmong(examinerId: string, userIds: string[]): Promise<Set<string>>;

  /**
   * Mã người dùng trong Danh sách dự thi của Phiên thi `sessionId` (bảng theo dõi kích hoạt). `ownerId` rỗng: không giới hạn chủ
   * (Quản trị viên). Trả `null` nếu Phiên thi không có hoặc không thuộc `ownerId`.
   */
  rosterUserIds(sessionId: string, ownerId: string | null): Promise<string[] | null>;
}
