import { describe, expect, it } from 'vitest';
import { queryString } from './query-string';
import { tagFacets } from './tag-facets';

const counts = (entries: Record<string, number>) =>
  Object.entries(entries).map(([tag, count]) => ({ tag, count }));

const COUNTS = counts({
  'thông hiểu': 95,
  'chương 2': 80,
  'vận dụng': 67,
  'chương 10': 5,
  'chương 3': 44,
  'nhận biết': 38,
  'độ phức tạp': 12,
  'ngăn xếp': 11,
  'windows 11': 3,
});

const view = (groups: ReturnType<typeof tagFacets>) =>
  groups.map((group) => [group.kind, group.items.map((item) => item.tag), group.hidden]);

describe('tagFacets', () => {
  it('gom theo loại: loại theo thứ tự tự nhiên, mức độ từ thấp tới cao, còn lại vào "khác" theo số câu', () => {
    expect(view(tagFacets(COUNTS, [], '', false))).toEqual([
      ['chương', ['chương 2', 'chương 3', 'chương 10'], 0],
      ['mức độ', ['nhận biết', 'thông hiểu', 'vận dụng'], 0],
      // "windows" chỉ có một tag nên không thành nhóm riêng.
      [null, ['độ phức tạp', 'ngăn xếp', 'windows 11'], 0],
    ]);
  });

  it('nhóm "khác" hiện 8 tag nhiều câu nhất; tag đã chọn luôn hiện; mở rộng thì hiện hết', () => {
    const many = counts(
      Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`ý ${'abcdefghijkl'[k]}`, 20 - k])),
    );
    const [short] = tagFacets(many, ['ý l'], '', false);
    expect(short?.items.map((item) => item.tag)).toEqual([
      'ý a',
      'ý b',
      'ý c',
      'ý d',
      'ý e',
      'ý f',
      'ý g',
      'ý h',
      'ý l',
    ]);
    expect(short?.hidden).toBe(3);
    expect(tagFacets(many, [], '', true)[0]?.items).toHaveLength(12);
  });

  it('tìm không dấu, nhiều từ; tag đã chọn vẫn hiện; loại giữ nguyên nhóm', () => {
    expect(view(tagFacets(COUNTS, ['chương 3'], 'van dung', false))).toEqual([
      ['chương', ['chương 3'], 0],
      ['mức độ', ['vận dụng'], 0],
    ]);
    expect(view(tagFacets(COUNTS, [], 'phuc do', false))).toEqual([[null, ['độ phức tạp'], 0]]);
    expect(tagFacets(COUNTS, [], 'khong co', false)).toEqual([]);
  });

  it('tag đã chọn không còn trong danh sách (đổi Chủ đề) vẫn hiện với số 0', () => {
    expect(tagFacets([], ['đồ thị'], '', false)).toEqual([
      { kind: null, items: [{ tag: 'đồ thị', count: 0, selected: true }], hidden: 0 },
    ]);
  });
});

describe('queryString', () => {
  it('mảng thành nhiều tham số cùng tên; rỗng thì bỏ', () => {
    expect(queryString({ tag: ['chương 1', 'a&b'], page: 2, q: '', none: [] })).toBe(
      '?tag=ch%C6%B0%C6%A1ng+1&tag=a%26b&page=2',
    );
  });
});
