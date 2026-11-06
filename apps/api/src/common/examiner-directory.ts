/**
 * Cổng "danh bạ Người ra đề" (Q307): `grading` kiểm người nhận Ủy quyền mà không đọc bảng `users` của `identity`. `identity`
 * cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const EXAMINER_DIRECTORY = Symbol('EXAMINER_DIRECTORY');

export interface ExaminerProfile {
  id: string;
  fullName: string;
  code: string | null;
}

export interface ExaminerDirectory {
  /** Hồ sơ của các `ids` (kể cả người đã Xóa, để vẫn hiện tên trong lịch sử); id lạ vắng trong kết quả. */
  profiles(ids: string[]): Promise<Map<string, ExaminerProfile>>;
  /** Người này còn là Người ra đề đang hoạt động (có Nhãn, chưa Khóa, chưa Xóa). */
  isActiveExaminer(userId: string): Promise<boolean>;
  /** Gợi ý Người ra đề đang hoạt động theo tên hoặc Mã định danh, trừ các `excludeIds`. */
  search(q: string, excludeIds: string[], limit: number): Promise<ExaminerProfile[]>;
}
