import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "danh mục Bộ đề" (Q223): `session` cần biết Bộ đề có dùng được không và tên là gì, nhưng không đọc bảng của `exam`.
 * `exam` cài đặt, nối ở `SessionPortsWiringModule`.
 */
export const EXAM_CATALOG = Symbol('EXAM_CATALOG');

export type CatalogExamStatus = 'draft' | 'published' | 'archived';

/** Một Phần của Bộ đề như `session` cần để cấu hình rút câu (Q438): mặc định và điểm từng câu. */
export interface CatalogDrawSection {
  id: string;
  title: string | null;
  /** Tỷ lệ rút mặc định ở Bộ đề; 100 nếu không đặt. */
  defaultPercent: number;
  /** Điểm từng câu của Phần, theo thứ tự. */
  points: number[];
  /** Mã câu trong Bộ đề (`exam_items.id`) của Phần, cùng thứ tự với `points`. */
  itemIds: string[];
}

export interface ExamCatalog {
  /** Trạng thái Bộ đề của chính người này; `null` nếu không có hoặc của người khác. */
  statusOwnedBy(ownerId: string, examId: string): Promise<CatalogExamStatus | null>;
  /** Tên của các Bộ đề (id không có thì vắng trong kết quả). */
  titlesOf(examIds: string[]): Promise<Map<string, string>>;
  /** Các Phần của Bộ đề theo thứ tự, kèm mặc định rút câu và điểm từng câu; rỗng nếu không có Bộ đề này. */
  drawSectionsOf(examId: string, executor?: Database | Transaction): Promise<CatalogDrawSection[]>;
}
