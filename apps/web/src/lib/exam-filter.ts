import { normalizeForSearch } from '@exam/shared';
import type { ExamDraft } from './exam-draft';

// Lọc câu hỏi trên trang Bộ đề đã phát hành (xem lại bộ đề): theo một phần nội dung hoặc tag, không phân biệt hoa thường và dấu.

export interface ItemFilter {
  /** Từ khóa gõ vào: khớp nội dung câu hoặc tag. Trống là không lọc theo từ khóa. */
  query: string;
  /** Một tag chọn trong các tag của Bộ đề; chuỗi rỗng là không lọc theo tag. */
  tag: string;
}

export interface FilterResult {
  /** Có đang lọc (từ khóa hoặc tag không trống) không. */
  active: boolean;
  /** Mã các câu khớp. */
  visible: ReadonlySet<string>;
  /** Số câu khớp của từng Phần (theo khóa Phần); 0 nghĩa là Phần không còn câu nào hiện. */
  perSection: ReadonlyMap<string, number>;
  /** Số câu khớp và tổng số câu của cả Bộ đề. */
  shown: number;
  total: number;
}

/** Các tag có trong Bộ đề, không trùng (không phân biệt hoa thường), theo thứ tự chữ cái tiếng Việt. */
export function tagsOfExam(draft: ExamDraft): string[] {
  const byFolded = new Map<string, string>();
  for (const section of draft.sections) {
    for (const item of section.items) {
      for (const tag of item.question.tags) {
        const key = normalizeForSearch(tag);
        if (key !== '' && !byFolded.has(key)) byFolded.set(key, tag.trim().toLowerCase());
      }
    }
  }
  return [...byFolded.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Câu nào khớp bộ lọc: từ khóa (nội dung hoặc tag) và tag chọn phải thỏa cả hai. */
export function filterExamItems(draft: ExamDraft, filter: ItemFilter): FilterResult {
  const query = normalizeForSearch(filter.query);
  const tag = normalizeForSearch(filter.tag);
  const visible = new Set<string>();
  const perSection = new Map<string, number>();
  let total = 0;
  for (const section of draft.sections) {
    let count = 0;
    for (const item of section.items) {
      total++;
      const tags = item.question.tags.map(normalizeForSearch);
      const matchesQuery =
        query === '' ||
        normalizeForSearch(item.question.preview).includes(query) ||
        tags.some((value) => value.includes(query));
      const matchesTag = tag === '' || tags.includes(tag);
      if (matchesQuery && matchesTag) {
        visible.add(item.questionId);
        count++;
      }
    }
    perSection.set(section.key, count);
  }
  return { active: query !== '' || tag !== '', visible, perSection, shown: visible.size, total };
}
