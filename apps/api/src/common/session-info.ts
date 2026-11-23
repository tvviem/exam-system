/**
 * Cổng "thông tin Phiên thi để xuất đề" (docs/plan/xuat-bo-de-thiet-ke.md mục 6): `paper` cần biết chủ, Bộ đề và thời gian của một
 * Phiên thi mà không đọc bảng của `session`. `session` cài đặt, nối ở `PaperPortsWiringModule`.
 */
export const SESSION_INFO = Symbol('SESSION_INFO');

export interface SessionPaperInfo {
  sessionId: string;
  title: string;
  examId: string;
  ownerId: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
}

/** Một Mã đề của Phiên thi dùng chung Mã đề kèm bộ câu đã lưu. */
export interface SessionPaperVariant {
  number: number;
  label: string;
  itemIds: string[];
}

/** Một người trong Danh sách dự thi kèm Mã đề được gán (nhãn; `null` nếu chưa gán). */
export interface SessionPaperPerson {
  code: string | null;
  fullName: string;
  classLabel: string | null;
  variantNumber: number | null;
  variantLabel: string | null;
}

export interface SessionInfoProvider {
  /** Phiên thi này (của bất kỳ chủ nào), hoặc `null` nếu không có. */
  info(sessionId: string): Promise<SessionPaperInfo | null>;
  /** Các Mã đề của Phiên thi theo số thứ tự; rỗng nếu Phiên thi mỗi người một đề. */
  variantsOf(sessionId: string): Promise<SessionPaperVariant[]>;
  /** Mọi người trong Danh sách dự thi kèm Mã đề được gán (để xuất Excel phân Mã đề). */
  peopleOf(sessionId: string): Promise<SessionPaperPerson[]>;
}
