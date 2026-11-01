import {
  EXAM_MAX_ITEMS,
  EXAM_MAX_SECTIONS,
  type ExamContent,
  type QuestionType,
  type RichText,
  textDoc,
} from '@exam/shared';

// Bản nháp Bộ đề trên màn hình (Q163): mọi thao tác là hàm thuần trả bản mới; chỉ khi bấm Lưu mới gửi lên server.

export interface DraftQuestion {
  type: QuestionType;
  preview: string;
  topicName: string;
  tags: string[];
  defaultPoints: number;
  archived: boolean;
}

export interface DraftItem {
  questionId: string;
  points: number;
  question: DraftQuestion;
}

export interface DraftSection {
  /** Khóa React ổn định; Phần đã lưu dùng chính id của nó. */
  key: string;
  /** Có khi Phần đã lưu ở server. */
  id?: string;
  title: string;
  instructions: RichText;
  items: DraftItem[];
}

export interface ExamDraft {
  title: string;
  instructions: RichText;
  sections: DraftSection[];
}

/** Câu hỏi lấy từ ngân hàng để thêm vào Bộ đề. */
export type PickedQuestion = DraftQuestion & { id: string };

let counter = 0;
/** Khóa cho Phần mới tạo trên màn hình. */
export const newKey = () => `new-${Date.now().toString(36)}-${counter++}`;

const emptySection = (key: string): DraftSection => ({
  key,
  title: '',
  instructions: textDoc(''),
  items: [],
});

export const newDraft = (title: string): ExamDraft => ({
  title,
  instructions: textDoc(''),
  sections: [emptySection(newKey())],
});

interface SavedExam {
  title: string;
  instructions: RichText;
  sections: {
    id: string;
    title: string | null;
    instructions: RichText;
    items: DraftItem[];
  }[];
}

export const draftFromExam = (exam: SavedExam): ExamDraft => ({
  title: exam.title,
  instructions: exam.instructions,
  sections: exam.sections.map((section) => ({
    key: section.id,
    id: section.id,
    title: section.title ?? '',
    instructions: section.instructions,
    items: section.items,
  })),
});

export const toContent = (draft: ExamDraft, version: number): ExamContent => ({
  title: draft.title,
  instructions: draft.instructions,
  version,
  sections: draft.sections.map((section) => ({
    ...(section.id ? { id: section.id } : {}),
    title: section.title.trim() || null,
    instructions: section.instructions,
    items: section.items.map(({ questionId, points }) => ({ questionId, points })),
  })),
});

export const questionIdsOf = (draft: ExamDraft): Set<string> =>
  new Set(draft.sections.flatMap((s) => s.items.map((i) => i.questionId)));

/** Tổng số câu và tổng điểm; cộng theo đơn vị 0,01 để không dính sai số số thực. */
export function totalsOf(draft: ExamDraft): { items: number; points: number } {
  const items = draft.sections.flatMap((s) => s.items);
  const units = items.reduce((sum, item) => sum + Math.round(item.points * 100), 0);
  return { items: items.length, points: units / 100 };
}

/** Số thứ tự (từ 1) của câu trong cả Bộ đề, đánh liên tục qua các Phần; null nếu không có. */
export function numberOf(draft: ExamDraft, questionId: string): number | null {
  let n = 0;
  for (const section of draft.sections) {
    for (const item of section.items) {
      n++;
      if (item.questionId === questionId) return n;
    }
  }
  return null;
}

const mapItems = (draft: ExamDraft, change: (items: DraftItem[]) => DraftItem[]): ExamDraft => ({
  ...draft,
  sections: draft.sections.map((s) => ({ ...s, items: change(s.items) })),
});

const mapSection = (draft: ExamDraft, key: string, change: (s: DraftSection) => DraftSection) => ({
  ...draft,
  sections: draft.sections.map((s) => (s.key === key ? change(s) : s)),
});

/** Thêm vào cuối Phần; bỏ qua câu đã có trong Bộ đề, dừng khi đủ số câu tối đa. `added` là số câu thật sự thêm. */
export function addItems(
  draft: ExamDraft,
  sectionKey: string,
  picked: PickedQuestion[],
): { draft: ExamDraft; added: number } {
  const have = questionIdsOf(draft);
  const room = EXAM_MAX_ITEMS - have.size;
  const fresh: DraftItem[] = [];
  for (const { id, ...question } of picked) {
    if (fresh.length >= room) break;
    if (have.has(id)) continue;
    have.add(id);
    fresh.push({ questionId: id, points: question.defaultPoints, question });
  }
  return {
    draft: mapSection(draft, sectionKey, (s) => ({ ...s, items: [...s.items, ...fresh] })),
    added: fresh.length,
  };
}

export const removeItem = (draft: ExamDraft, questionId: string): ExamDraft =>
  mapItems(draft, (items) => items.filter((i) => i.questionId !== questionId));

export const setPoints = (draft: ExamDraft, questionId: string, points: number): ExamDraft =>
  mapItems(draft, (items) =>
    items.map((i) => (i.questionId === questionId ? { ...i, points } : i)),
  );

/** Đổi chỗ với câu liền trước (-1) hoặc liền sau (1) trong cùng Phần; ở biên thì giữ nguyên. */
export function moveItem(draft: ExamDraft, questionId: string, delta: -1 | 1): ExamDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => {
      const from = section.items.findIndex((i) => i.questionId === questionId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= section.items.length) return section;
      const items = [...section.items];
      [items[from], items[to]] = [items[to] as DraftItem, items[from] as DraftItem];
      return { ...section, items };
    }),
  };
}

/** Chuyển câu xuống cuối Phần khác, giữ điểm đã đặt. */
export function moveItemToSection(
  draft: ExamDraft,
  questionId: string,
  targetKey: string,
): ExamDraft {
  const item = draft.sections.flatMap((s) => s.items).find((i) => i.questionId === questionId);
  if (!item || !draft.sections.some((s) => s.key === targetKey)) return draft;
  return mapSection(removeItem(draft, questionId), targetKey, (s) => ({
    ...s,
    items: [...s.items, item],
  }));
}

export function moveSection(draft: ExamDraft, key: string, delta: -1 | 1): ExamDraft {
  const from = draft.sections.findIndex((s) => s.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.sections.length) return draft;
  const sections = [...draft.sections];
  [sections[from], sections[to]] = [sections[to] as DraftSection, sections[from] as DraftSection];
  return { ...draft, sections };
}

export const addSection = (draft: ExamDraft, key: string = newKey()): ExamDraft =>
  draft.sections.length >= EXAM_MAX_SECTIONS
    ? draft
    : { ...draft, sections: [...draft.sections, emptySection(key)] };

/** Xóa Phần cùng các câu trong nó; Bộ đề luôn còn ít nhất một Phần. */
export const removeSection = (draft: ExamDraft, key: string): ExamDraft =>
  draft.sections.length <= 1
    ? draft
    : { ...draft, sections: draft.sections.filter((s) => s.key !== key) };

export const updateSection = (
  draft: ExamDraft,
  key: string,
  changes: Partial<Pick<DraftSection, 'title' | 'instructions'>>,
): ExamDraft => mapSection(draft, key, (s) => ({ ...s, ...changes }));
