import { sessionDrawTotals } from '@exam/shared';
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
  sections: {
    id: string;
    title: string | null;
    instructions: unknown;
    /** Tỷ lệ rút mặc định của Phần ở Bộ đề (Q438); 100 nếu không đặt. */
    drawPercent: number;
    items: ContentItem[];
  }[];
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
  /** Ảnh này có nằm trong bản chụp của một câu thuộc Bộ đề không. */
  hasIllustration(
    examId: string,
    illustrationId: string,
    executor?: ContentExecutor,
  ): Promise<boolean>;
  /** Chủ của Bộ đề (Đính chính đáp án chỉ chủ Bộ đề làm được, Q302); `null` nếu không có Bộ đề này. */
  ownerOf(examId: string, executor?: ContentExecutor): Promise<string | null>;
  /** Tên và số câu của các Bộ đề. */
  summariesOf(
    examIds: string[],
    executor?: ContentExecutor,
  ): Promise<Map<string, { title: string; itemCount: number }>>;
}

/**
 * Số câu và điểm tối đa (đơn vị 0,01) mỗi Người dự thi nhận (Q438): mặc định rút của Phần ở Bộ đề, bị ghi đè bởi `overrides` của
 * Phiên thi; Phiên thi dùng chung Mã đề thì lấy `variantTotals`. Chấm điểm, Kết quả, Phúc khảo, theo dõi và danh sách Phiên thi đều dùng hàm này.
 */
export function drawTotalsOfContent(
  content: ExamContentData,
  overrides: Readonly<Record<string, number>>,
  /** Phiên thi dùng chung Mã đề: tổng của chính Mã đề (câu trong Phần có thể lệch điểm nên không suy từ tỷ lệ); `null` thì theo tỷ lệ. */
  variantTotals?: { count: number; maxCenti: number } | null,
) {
  if (variantTotals) return variantTotals;
  return sessionDrawTotals(
    content.sections.map((section) => ({
      id: section.id,
      drawPercent: section.drawPercent,
      points: section.items.map((item) => item.points),
    })),
    overrides,
  );
}
