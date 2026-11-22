import {
  type DrawProblem,
  distributePoints,
  drawPercentSchema,
  drawProblemsOf,
  drawTotalsOf,
  EXAM_MAX_ITEMS,
  EXAM_MAX_SECTIONS,
  type ExamContent,
  type PointsDistribution,
  type PointsPlan,
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
  /**
   * Tỷ lệ rút mặc định của Phần (Rút câu, Q438): 0 đến 100, 100 là lấy đủ (như trước khi có Rút câu). Giữ NaN khi người dùng
   * đang gõ dở; chỉ gửi lên server khi dưới 100 %.
   */
  drawPercent: number;
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
  drawPercent: 100,
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
    drawPercent?: number;
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
    drawPercent: section.drawPercent ?? 100,
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
    // Chỉ gửi khi dưới 100 %: vắng nghĩa là lấy đủ, nên Bộ đề không dùng Rút câu gửi y như trước.
    ...(section.drawPercent < 100 ? { drawPercent: section.drawPercent } : {}),
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
  changes: Partial<Pick<DraftSection, 'title' | 'instructions' | 'drawPercent'>>,
): ExamDraft => mapSection(draft, key, (s) => ({ ...s, ...changes }));

/** Phạm vi của Đặt điểm nhanh: cả Bộ đề, một Phần hoặc một Loại câu hỏi. */
export type PointsScope =
  | { kind: 'all' }
  | { kind: 'section'; key: string }
  | { kind: 'type'; type: QuestionType };

const inScope = (scope: PointsScope, section: DraftSection, item: DraftItem) =>
  scope.kind === 'all' ||
  (scope.kind === 'section' && section.key === scope.key) ||
  (scope.kind === 'type' && item.question.type === scope.type);

/** Số câu thuộc phạm vi (để hộp thoại hiện trước "áp dụng cho N câu"). */
export const countInScope = (draft: ExamDraft, scope: PointsScope): number =>
  draft.sections.reduce((n, s) => n + s.items.filter((i) => inScope(scope, s, i)).length, 0);

/** Đặt điểm nhanh (Q168): câu trong phạm vi nhận điểm mới theo thứ tự trong Bộ đề; câu ngoài phạm vi giữ nguyên. */
export function applyPoints(
  draft: ExamDraft,
  scope: PointsScope,
  plan: PointsPlan,
): { ok: true; draft: ExamDraft; count: number } | Extract<PointsDistribution, { ok: false }> {
  const distribution = distributePoints(countInScope(draft, scope), plan);
  if (!distribution.ok) return distribution;
  let next = 0;
  return {
    ok: true,
    count: distribution.points.length,
    draft: {
      ...draft,
      sections: draft.sections.map((s) => ({
        ...s,
        items: s.items.map((i) =>
          inScope(scope, s, i) ? { ...i, points: distribution.points[next++] as number } : i,
        ),
      })),
    },
  };
}

/** Tỷ lệ rút hợp lệ: 0 đến 100, tối đa hai chữ số lẻ (cùng quy tắc với server). */
/** Chữ người dùng gõ trong ô số thành số: dấu phẩy hoặc chấm đều được; để trống là NaN (không hợp lệ), không phải 0. */
export const numberFromText = (text: string): number =>
  text.trim() === '' ? Number.NaN : Number(text.replace(',', '.'));

/**
 * Chữ hiện trong ô số khi số của bản nháp đổi: giữ chữ đang gõ nếu vẫn ứng với số đó ("12," là 12; ô trống ứng với NaN
 * nên không hiện chữ "NaN"); số đổi từ bên ngoài (Đặt điểm nhanh...) thì hiện số mới.
 */
export const textForNumber = (current: string, value: number): string => {
  const typed = numberFromText(current);
  return typed === value || (Number.isNaN(typed) && Number.isNaN(value)) ? current : String(value);
};

export const drawPercentValid = (percent: number): boolean =>
  drawPercentSchema.safeParse(percent).success;

export const setDrawPercent = (draft: ExamDraft, key: string, percent: number): ExamDraft =>
  mapSection(draft, key, (s) => ({ ...s, drawPercent: percent }));

export interface DrawSummary {
  /** Có Phần nào rút dưới 100 % không (không thì Bộ đề dùng nguyên, như trước khi có Rút câu). */
  active: boolean;
  /** Số câu và điểm tối đa mỗi Người dự thi nhận. */
  count: number;
  /** `null` khi còn Phần lệch điểm: không xác định được điểm tối đa nên không hiện số. */
  maxPoints: number | null;
  sections: { key: string; count: number; total: number; valid: boolean }[];
  /** Vấn đề chặn Phát hành (Q440, Q441); `sectionId` là khóa của Phần trong bản nháp. */
  problems: DrawProblem[];
}

/**
 * Tóm tắt rút câu của bản nháp bằng cùng hàm thuần với server. Tỷ lệ đang gõ dở (không hợp lệ) tạm tính như 100 % để số không
 * nhảy lung tung, và được đánh dấu `valid: false` để chặn Lưu.
 */
export function drawSummaryOf(draft: ExamDraft): DrawSummary {
  const sections = draft.sections.map((s) => ({
    key: s.key,
    valid: drawPercentValid(s.drawPercent),
    percent: drawPercentValid(s.drawPercent) ? s.drawPercent : 100,
    points: s.items.map((i) => i.points),
  }));
  const percents = Object.fromEntries(sections.map((s) => [s.key, s.percent]));
  const totals = drawTotalsOf(
    sections.map((s) => ({ id: s.key, points: s.points })),
    percents,
  );
  const problems = drawProblemsOf(
    sections.map((s) => ({ id: s.key, percent: s.percent, points: s.points })),
  );
  return {
    active: sections.some((s) => s.percent < 100),
    count: totals.count,
    maxPoints: problems.some((p) => p.code === 'draw_points_uneven') ? null : totals.maxCenti / 100,
    sections: sections.map((s) => ({
      key: s.key,
      valid: s.valid,
      total: s.points.length,
      count: drawTotalsOf([{ id: s.key, points: s.points }], { [s.key]: s.percent }).count,
    })),
    problems,
  };
}

export interface DrawRows {
  /** Từng Phần theo thứ tự: số câu có sẵn, số câu mỗi Người dự thi nhận và tỷ lệ rút (tỷ lệ không hợp lệ tạm tính 100 %). */
  rows: { key: string; total: number; count: number; percent: number }[];
  /** Số câu của cả Bộ đề. */
  total: number;
  /** Số câu và điểm tối đa mỗi Người dự thi nhận (`maxPoints` null khi còn Phần lệch điểm). */
  count: number;
  maxPoints: number | null;
}

/** Bảng "mỗi Người dự thi nhận bao nhiêu câu" cho hộp Phát hành: cùng phép tính với server qua `drawSummaryOf`. */
export function drawRowsOf(draft: ExamDraft): DrawRows {
  const summary = drawSummaryOf(draft);
  const rows = summary.sections.map((s, i) => {
    const percent = draft.sections[i]?.drawPercent ?? 100;
    return {
      key: s.key,
      total: s.total,
      count: s.count,
      percent: drawPercentValid(percent) ? percent : 100,
    };
  });
  return {
    rows,
    total: rows.reduce((n, r) => n + r.total, 0),
    count: summary.count,
    maxPoints: summary.maxPoints,
  };
}

/**
 * Phần đang xem khi cuộn trang. `tops` là vị trí đầu từng Phần so với đỉnh khung nhìn (getBoundingClientRect().top), theo thứ
 * tự; `offset` là mốc dưới thanh đầu trang. Là Phần cuối cùng có đầu đã lên tới mốc; cuộn tới đáy trang thì là Phần cuối
 * (Phần cuối ngắn có thể không bao giờ lên tới mốc).
 */
export function currentSectionIndex(
  tops: readonly number[],
  offset: number,
  atBottom = false,
): number {
  if (tops.length === 0) return 0;
  if (atBottom) return tops.length - 1;
  let index = 0;
  tops.forEach((top, i) => {
    if (top <= offset) index = i;
  });
  return index;
}
