/**
 * Cổng "danh bạ Quản trị viên" (Q366): `backup` biết gửi chuông cho ai mà không đọc bảng `users` của `identity`. `identity`
 * cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const ADMIN_DIRECTORY = Symbol('ADMIN_DIRECTORY');

export interface AdminDirectory {
  /** Id các Quản trị viên đang hoạt động (chưa Khóa, chưa Xóa). */
  activeAdminIds(): Promise<string[]>;
}
