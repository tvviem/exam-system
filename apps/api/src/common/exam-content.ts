import type { Database, Transaction } from '../db/db.module';

/**
 * Cổng "nội dung Bộ đề đã Phát hành" (Q228): `attempt` chỉ đọc bản chụp `exam_items.snapshot` (bất biến của hệ thống),
 * không đọc bảng của `exam`. `exam` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const EXAM_CONTENT = Symbol('EXAM_CONTENT');

export type ContentExecutor = Database | Transaction;

/** Bản chụp một câu (`ItemSnapshot` của `exam`); `payload` còn chứa Đáp án đúng nên không bao giờ gửi nguyên cho client. */
export interface ContentSnapshot {
  questionId: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  stem: unknown;
  payload: Record<string, unknown>;
  illustrations: { id: string; width: number | null; height: number | null; variants: number[] }[];
}

export interface ContentItem {
  itemId: string;
  sectionId: string;
  points: number;
  snapshot: ContentSnapshot;
}

export interface ExamContentData {
  examId: string;
  title: string;
  instructions: unknown;
  sections: { id: string; title: string | null; instructions: unknown; items: ContentItem[] }[];
}

export interface ExamContentProvider {
  /** Toàn bộ nội dung theo thứ tự gốc; `null` nếu Bộ đề chưa Phát hành hoặc không có. */
  contentOf(examId: string, executor?: ContentExecutor): Promise<ExamContentData | null>;
  /** Một số câu của Bộ đề (id không thuộc Bộ đề thì vắng trong kết quả). */
  itemsOf(
    examId: string,
    itemIds: string[],
    executor?: ContentExecutor,
  ): Promise<Map<string, ContentItem>>;
  /** Tên và số câu của các Bộ đề. */
  summariesOf(
    examIds: string[],
    executor?: ContentExecutor,
  ): Promise<Map<string, { title: string; itemCount: number }>>;
}
