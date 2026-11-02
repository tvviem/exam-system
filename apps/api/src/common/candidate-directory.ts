import type { Database, Transaction } from '../db/db.module';

/** Kết nối để chạy truy vấn: giao dịch của bên gọi (giữ nguyên tính nguyên tử) hoặc kết nối thường. */
export type Executor = Database | Transaction;

/**
 * Cổng "danh bạ Người dự thi" (Q223): `session` tìm, lọc và đọc hồ sơ Người dự thi nhưng không đọc bảng `users` của
 * `identity`. `identity` cài đặt, nối ở `SessionPortsWiringModule`.
 */
export const CANDIDATE_DIRECTORY = Symbol('CANDIDATE_DIRECTORY');

/** Cách chọn người khi thêm vào Danh sách dự thi (Q200). */
export type CandidateSelector =
  | { userIds: string[] }
  | { classLabel: string }
  | { codes: string[] };

export type CandidateSort = 'name' | 'code';

export interface CandidateRecord {
  id: string;
  code: string | null;
  classLabel: string | null;
  status: 'active' | 'locked';
  removed: boolean;
  /** Đang mang Nhãn vai trò Người dự thi. */
  isCandidate: boolean;
}

export interface CandidateProfile {
  id: string;
  code: string | null;
  fullName: string;
}

export interface CandidateDirectory {
  /**
   * Một trang hồ sơ của các `ids`, lọc theo tên hoặc Mã định danh (`q` không phân biệt dấu, hoa thường) và xếp theo
   * tên gọi (từ cuối của họ tên), rồi họ và tên lót (`sort: 'name'`, mặc định), hoặc theo Mã định danh từng ký tự,
   * không phân biệt hoa thường, người chưa có mã đứng cuối (`sort: 'code'`).
   */
  page(
    ids: string[],
    options: { q?: string; sort?: CandidateSort; limit: number; offset: number },
  ): Promise<{ total: number; items: CandidateProfile[] }>;

  /** Gợi ý người và Lớp đủ điều kiện dự thi (đang hoạt động, mang Nhãn Người dự thi, khác `excludeUserId`). */
  search(
    q: string,
    options: { excludeUserId: string; userLimit: number; classLimit: number },
  ): Promise<{
    users: { id: string; code: string | null; fullName: string; classLabel: string | null }[];
    classes: { label: string; count: number }[];
  }>;

  /** Đổi cách chọn thành danh sách người kèm trạng thái; Mã không tìm thấy nằm ở `notFound`. */
  resolve(
    selector: CandidateSelector,
    executor?: Executor,
  ): Promise<{ people: CandidateRecord[]; notFound: string[] }>;

  /** Những người trong `ids` còn đủ điều kiện dự thi (chưa Xóa, chưa Khóa, còn Nhãn), khác `excludeUserId`. */
  eligibleAmong(
    ids: string[],
    excludeUserId: string,
    executor?: Executor,
  ): Promise<{ id: string; classLabel: string | null }[]>;
}
