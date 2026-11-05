// Trạng thái một câu trên lưới số câu và hộp thoại Nộp bài (docs/plan/slice-4.md, Q240, Q244).

export type AnswerState = 'blank' | 'partial' | 'done';

export interface AnswerShape {
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  payload: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Chưa làm (`blank`), làm dở (`partial`: chùm đúng/sai mới trả lời một phần Mệnh đề) hoặc đã làm (`done`). */
export function answerStateOf(item: AnswerShape, value: unknown): AnswerState {
  const v = asRecord(value);
  switch (item.type) {
    case 'single_choice':
      return typeof v.optionId === 'string' ? 'done' : 'blank';
    case 'multiple_choice':
      return Array.isArray(v.optionIds) && v.optionIds.length > 0 ? 'done' : 'blank';
    case 'true_false_cluster': {
      const answered = Object.keys(asRecord(v.answers)).length;
      const total = (asRecord(item.payload).statements as unknown[] | undefined)?.length ?? 0;
      if (answered === 0) return 'blank';
      return answered >= total ? 'done' : 'partial';
    }
    case 'essay':
      return typeof v.text === 'string' && v.text.trim() !== '' ? 'done' : 'blank';
  }
}

export const isBlank = (item: AnswerShape, value: unknown) =>
  answerStateOf(item, value) === 'blank';

export interface Progress {
  done: number;
  partial: number;
  blank: number;
  flagged: number;
  total: number;
}

export function progressOf(
  items: { item: AnswerShape; response: { value: unknown; flagged: boolean } | null }[],
): Progress {
  const result: Progress = { done: 0, partial: 0, blank: 0, flagged: 0, total: items.length };
  for (const { item, response } of items) {
    result[answerStateOf(item, response?.value)] += 1;
    if (response?.flagged) result.flagged += 1;
  }
  return result;
}

// Rà soát trước khi nộp (Q281): nhảy tới các câu chưa làm, làm dở hay đánh dấu.

export type ReviewKind = 'blank' | 'partial' | 'flagged';
export interface ReviewCell {
  state: AnswerState;
  flagged: boolean;
}

/** Một câu có thuộc loại cần rà soát không; "đánh dấu" độc lập với trạng thái làm bài. */
export const matchesKind = (cell: ReviewCell, kind: ReviewKind) =>
  kind === 'flagged' ? cell.flagged : cell.state === kind;

/** Vị trí (từ 0) các câu thuộc loại này, theo thứ tự đề. */
export const indexesOfKind = (cells: readonly ReviewCell[], kind: ReviewKind) =>
  cells.flatMap((cell, index) => (matchesKind(cell, kind) ? [index] : []));

/** Câu kế tiếp sau `from` thuộc loại này, vòng về đầu khi hết; chỉ còn chính câu đang đứng thì trả về nó; không có thì `null`. */
export function nextOfKind(cells: readonly ReviewCell[], from: number, kind: ReviewKind) {
  const all = indexesOfKind(cells, kind);
  if (all.length === 0) return null;
  return all.find((index) => index > from) ?? (all[0] as number);
}

/** Những loại còn lại cho dòng trạng thái ở thanh dưới: chỉ số khác 0, thứ tự chưa làm, làm dở, đánh dấu. */
export function remainingOf(progress: Progress): { kind: ReviewKind; count: number }[] {
  return (
    [
      { kind: 'blank', count: progress.blank },
      { kind: 'partial', count: progress.partial },
      { kind: 'flagged', count: progress.flagged },
    ] as const
  ).filter((entry) => entry.count > 0);
}
