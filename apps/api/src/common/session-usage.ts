/**
 * Cổng "Bộ đề đang được dùng cho bao nhiêu Phiên thi" (Q204): `exam` hiện số này ở chi tiết và danh sách Bộ đề nhưng
 * không đọc bảng của `session`. `session` cài đặt, nối ở `SessionUsageWiringModule`.
 */
export const SESSION_USAGE = Symbol('SESSION_USAGE');

export interface SessionUsage {
  /** Số Phiên thi chưa Hủy của từng Bộ đề (mọi id được hỏi đều có khóa). */
  countByExam(examIds: string[]): Promise<Map<string, number>>;
}
