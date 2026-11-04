import type { PickedQuestion } from './exam-draft';

// Logic chọn Câu hỏi của hộp "Thêm câu hỏi vào Bộ đề" (thuần, có test). Các câu đã chọn giữ trong một Map theo id, chỉ lưu bản
// tóm tắt đủ để vẽ dòng trong Bộ đề (không giữ nội dung đầy đủ), nên 200 câu tối đa vẫn nhẹ. Hàm nào cũng trả Map mới.

/** Số câu còn thêm được là `room`; câu đã có trong Bộ đề (`existing`) không chọn lại. */
export function toggleQuestion(
  chosen: ReadonlyMap<string, PickedQuestion>,
  item: PickedQuestion,
  room: number,
): Map<string, PickedQuestion> {
  const next = new Map(chosen);
  if (next.has(item.id)) next.delete(item.id);
  else if (next.size < room) next.set(item.id, item);
  return next;
}

/**
 * Shift + tick: chọn (`select = true`) hay bỏ chọn cả dải từ câu mốc `from` tới câu vừa bấm `to` (chỉ số trong `items` của trang
 * hiện tại, theo chiều nào cũng được). Câu đã có trong Bộ đề bị bỏ qua; khi chọn thì dừng lúc đủ chỗ.
 */
export function selectRange(
  items: readonly PickedQuestion[],
  from: number,
  to: number,
  select: boolean,
  chosen: ReadonlyMap<string, PickedQuestion>,
  existing: ReadonlySet<string>,
  room: number,
): Map<string, PickedQuestion> {
  const next = new Map(chosen);
  if (items.length === 0) return next;
  const [start, end] = from <= to ? [from, to] : [to, from];
  for (const item of items.slice(start, end + 1)) {
    if (existing.has(item.id)) continue;
    if (!select) next.delete(item.id);
    else if (next.size < room) next.set(item.id, item);
  }
  return next;
}

export interface PageSelection {
  /** `none`: chưa chọn câu nào của trang; `some`: chọn một phần; `all`: đã chọn hết các câu chọn được. */
  state: 'none' | 'some' | 'all';
  /** Số câu của trang còn chọn được (không tính câu đã có trong Bộ đề). */
  selectable: number;
  chosen: number;
}

export function pageState(
  items: readonly PickedQuestion[],
  chosen: ReadonlyMap<string, PickedQuestion>,
  existing: ReadonlySet<string>,
): PageSelection {
  const selectable = items.filter((item) => !existing.has(item.id));
  const picked = selectable.filter((item) => chosen.has(item.id)).length;
  const state = picked === 0 ? 'none' : picked === selectable.length ? 'all' : 'some';
  return { state, selectable: selectable.length, chosen: picked };
}

/** Ô "chọn tất cả trên trang": chưa chọn hết thì chọn nốt cả trang (trong giới hạn chỗ), đã chọn hết thì bỏ chọn cả trang. */
export function togglePage(
  items: readonly PickedQuestion[],
  chosen: ReadonlyMap<string, PickedQuestion>,
  existing: ReadonlySet<string>,
  room: number,
): Map<string, PickedQuestion> {
  const { state } = pageState(items, chosen, existing);
  return selectRange(items, 0, items.length - 1, state !== 'all', chosen, existing, room);
}
