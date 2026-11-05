import { describe, expect, it } from 'vitest';
import type { PickedQuestion } from './exam-draft';
import { pageState, selectRange, togglePage, toggleQuestion } from './question-selection';

const pick = (id: string): PickedQuestion => ({
  id,
  type: 'single_choice',
  preview: id,
  topicName: 'Giải thuật',
  tags: [],
  defaultPoints: 0.5,
  archived: false,
});
const page = (...ids: string[]) => ids.map(pick);
const idsOf = (chosen: ReadonlyMap<string, PickedQuestion>) => [...chosen.keys()];
const chosenOf = (...ids: string[]) => new Map(ids.map((id) => [id, pick(id)]));
const NONE = new Set<string>();

describe('toggleQuestion', () => {
  it('bật rồi tắt một câu, không đổi Map cũ', () => {
    const start = chosenOf('a');
    const on = toggleQuestion(start, pick('b'), 10);
    expect(idsOf(on)).toEqual(['a', 'b']);
    expect(idsOf(start)).toEqual(['a']);
    expect(idsOf(toggleQuestion(on, pick('a'), 10))).toEqual(['b']);
  });

  it('hết chỗ (room) thì không thêm câu mới nhưng vẫn bỏ chọn được', () => {
    const full = chosenOf('a', 'b');
    expect(idsOf(toggleQuestion(full, pick('c'), 2))).toEqual(['a', 'b']);
    expect(idsOf(toggleQuestion(full, pick('a'), 2))).toEqual(['b']);
  });
});

describe('selectRange: Shift + tick một dải liên tiếp', () => {
  const items = page('a', 'b', 'c', 'd', 'e');

  it('chọn dải từ câu mốc tới câu vừa bấm, theo chiều nào cũng được', () => {
    expect(idsOf(selectRange(items, 1, 3, true, new Map(), NONE, 10))).toEqual(['b', 'c', 'd']);
    expect(idsOf(selectRange(items, 3, 1, true, new Map(), NONE, 10))).toEqual(['b', 'c', 'd']);
  });

  it('bỏ chọn dải khi câu mốc đang bỏ chọn (select = false)', () => {
    const start = chosenOf('a', 'b', 'c', 'd', 'e');
    expect(idsOf(selectRange(items, 1, 3, false, start, NONE, 10))).toEqual(['a', 'e']);
  });

  it('bỏ qua câu đã có trong Bộ đề và giữ các câu đã chọn ở trang khác', () => {
    const start = chosenOf('z');
    const result = selectRange(items, 0, 4, true, start, new Set(['c']), 10);
    expect(idsOf(result)).toEqual(['z', 'a', 'b', 'd', 'e']);
  });

  it('dừng khi đủ chỗ, giữ thứ tự trong dải', () => {
    const result = selectRange(items, 0, 4, true, chosenOf('z'), NONE, 3);
    expect(idsOf(result)).toEqual(['z', 'a', 'b']);
  });

  it('dải kéo ngược mà hết chỗ thì cắt các câu xa mốc, giữ các câu gần mốc', () => {
    const result = selectRange(items, 4, 0, true, new Map(), NONE, 2);
    expect(idsOf(result)).toEqual(['d', 'e']); // giữ thứ tự danh sách
  });
});

describe('pageState / togglePage: chọn tất cả trên trang hiện tại', () => {
  const items = page('a', 'b', 'c', 'd');

  it('đếm chỉ các câu chọn được (không tính câu đã có trong Bộ đề)', () => {
    expect(pageState(items, new Map(), new Set(['d']))).toEqual({
      state: 'none',
      selectable: 3,
      chosen: 0,
    });
    expect(pageState(items, chosenOf('a'), new Set(['d']))).toEqual({
      state: 'some',
      selectable: 3,
      chosen: 1,
    });
    expect(pageState(items, chosenOf('a', 'b', 'c'), new Set(['d'])).state).toBe('all');
  });

  it('trang toàn câu đã có trong Bộ đề: không có gì để chọn', () => {
    expect(pageState(items, new Map(), new Set(['a', 'b', 'c', 'd']))).toEqual({
      state: 'none',
      selectable: 0,
      chosen: 0,
    });
  });

  it('chưa chọn hết thì chọn nốt cả trang, giữ câu của trang khác', () => {
    const result = togglePage(items, chosenOf('z', 'b'), new Set(['d']), 10);
    expect(idsOf(result).sort()).toEqual(['a', 'b', 'c', 'z']);
  });

  it('đã chọn hết trang thì bỏ chọn cả trang nhưng giữ trang khác', () => {
    const result = togglePage(items, chosenOf('z', 'a', 'b', 'c', 'd'), NONE, 10);
    expect(idsOf(result)).toEqual(['z']);
  });

  it('hết chỗ mà trang còn câu đã chọn thì bấm lại bỏ chọn được cả trang (không kẹt ở trạng thái một phần)', () => {
    const start = chosenOf('z', 'a');
    // Trang 4 câu, chỉ còn chỗ cho 2 câu: đã chọn z, a nên đầy; bấm là bỏ chọn phần của trang.
    const result = togglePage(items, start, NONE, 2);
    expect(idsOf(result)).toEqual(['z']);
  });

  it('chọn cả trang không vượt số chỗ còn lại', () => {
    const result = togglePage(items, chosenOf('z'), NONE, 3);
    expect(idsOf(result)).toEqual(['z', 'a', 'b']);
  });
});
