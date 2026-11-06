import type { ExamContentData } from '../../common/exam-content';

/** Một câu của Bộ đề theo thứ tự gốc, đánh số từ 1 qua mọi Phần (số thứ tự Người ra đề thấy khi chấm). */
export interface GradingItem {
  itemId: string;
  no: number;
  sectionId: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  points: number;
  stem: unknown;
  payload: Record<string, unknown>;
}

export function itemsOf(content: ExamContentData): GradingItem[] {
  let no = 0;
  return content.sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.itemId,
      no: ++no,
      sectionId: section.id,
      type: item.snapshot.type,
      points: item.points,
      stem: item.snapshot.stem,
      payload: item.snapshot.payload,
    })),
  );
}

export const toCentiScore = (value: string | null): number | null =>
  value === null ? null : Math.round(Number(value) * 100);
