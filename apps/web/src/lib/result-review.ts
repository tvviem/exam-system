import type { MyResultItem } from './grading';

// Duyệt Kết quả từng câu của Người dự thi (Q318): đếm theo kết quả, lọc, bước tới câu kế trong bộ lọc. Hàm thuần.

export type ReviewVerdict = MyResultItem['verdict'];

export const REVIEW_VERDICTS = [
  'correct',
  'partial',
  'wrong',
  'blank',
] as const satisfies readonly ReviewVerdict[];

type Judged = Pick<MyResultItem, 'verdict'>;

export function countVerdicts(items: readonly Judged[]): Record<ReviewVerdict, number> {
  const counts: Record<ReviewVerdict, number> = { correct: 0, partial: 0, wrong: 0, blank: 0 };
  for (const item of items) counts[item.verdict] += 1;
  return counts;
}

export const matchesFilter = (item: Judged, filter: ReviewVerdict | null) =>
  filter === null || item.verdict === filter;

/**
 * Câu kế tiếp theo hướng `direction` bắt đầu từ vị trí `from` (không tính chính nó), chỉ trong những câu khớp bộ lọc.
 * Không quay vòng: hết đầu hoặc cuối thì trả `null`.
 */
export function stepIndex(
  items: readonly Judged[],
  from: number,
  filter: ReviewVerdict | null,
  direction: 1 | -1,
): number | null {
  for (let i = from + direction; i >= 0 && i < items.length; i += direction) {
    const item = items[i];
    if (item && matchesFilter(item, filter)) return i;
  }
  return null;
}

/** Câu sai kế tiếp sau vị trí `from`, quay vòng về đầu khi hết; `null` nếu không có câu sai nào (hoặc chỉ có chính câu đang xem). */
export function nextWrongIndex(items: readonly Judged[], from: number): number | null {
  const after = stepIndex(items, from, 'wrong', 1);
  if (after !== null) return after;
  for (let i = 0; i < from && i < items.length; i += 1) {
    if (items[i]?.verdict === 'wrong') return i;
  }
  return null;
}

/** Vị trí của câu số `no` (số thứ tự Người dự thi đã thấy); không thấy hoặc không hợp lệ thì về câu đầu. */
export function indexOfNo(items: readonly Pick<MyResultItem, 'no'>[], no: number | undefined) {
  if (no === undefined) return 0;
  const index = items.findIndex((item) => item.no === no);
  return index === -1 ? 0 : index;
}
