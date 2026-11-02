/**
 * Cổng "danh mục Bộ đề" (Q223): `session` cần biết Bộ đề có dùng được không và tên là gì, nhưng không đọc bảng của `exam`.
 * `exam` cài đặt, nối ở `SessionPortsWiringModule`.
 */
export const EXAM_CATALOG = Symbol('EXAM_CATALOG');

export type CatalogExamStatus = 'draft' | 'published' | 'archived';

export interface ExamCatalog {
  /** Trạng thái Bộ đề của chính người này; `null` nếu không có hoặc của người khác. */
  statusOwnedBy(ownerId: string, examId: string): Promise<CatalogExamStatus | null>;
  /** Tên của các Bộ đề (id không có thì vắng trong kết quả). */
  titlesOf(examIds: string[]): Promise<Map<string, string>>;
}
