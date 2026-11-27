import { describe, expect, it } from 'vitest';
import { describeTagFilter, tagGroups, tagKind } from './tag-filter.js';

describe('tagKind: loại của tag suy từ chính chữ của tag', () => {
  it.each([
    ['chương 1', 'chương'],
    ['chương 2.1', 'chương'],
    ['mức: vận dụng', 'mức'],
    ['bài tập: chương 3', 'bài tập'],
    ['nhận biết', 'mức độ'],
    ['thông hiểu', 'mức độ'],
    ['vận dụng', 'mức độ'],
    ['vận dụng cao', 'mức độ'],
  ])('%s thuộc loại %s', (tag, kind) => {
    expect(tagKind(tag)).toBe(kind);
  });

  it.each(['ngăn xếp', 'ipv6', '2024', 'chương', ': trống', 'trống:'])(
    '%s không có loại',
    (tag) => {
      expect(tagKind(tag)).toBeNull();
    },
  );

  it('chữ dạng tổ hợp (NFD) vẫn nhận ra mức độ', () => {
    expect(tagKind('vận dụng'.normalize('NFD'))).toBe('mức độ');
  });
});

describe('tagGroups: mọi nhóm phải khớp, trong một nhóm chỉ cần một tag', () => {
  const chosen = ['chương 2', 'vận dụng', 'chương 1', 'ngăn xếp', 'nhận biết', 'đồ thị'];

  it('khớp tất cả: cùng loại "hoặc", khác loại và tag không loại "và"', () => {
    expect(tagGroups(chosen, 'all')).toEqual([
      ['chương 1', 'chương 2'],
      ['nhận biết', 'vận dụng'],
      ['ngăn xếp'],
      ['đồ thị'],
    ]);
  });

  it('khớp bất kỳ: một nhóm duy nhất', () => {
    expect(tagGroups(['chương 2', 'ngăn xếp'], 'any')).toEqual([['chương 2', 'ngăn xếp']]);
  });

  it('không chọn tag nào thì không có điều kiện', () => {
    expect(tagGroups([], 'all')).toEqual([]);
    expect(tagGroups([], 'any')).toEqual([]);
  });
});

describe('describeTagFilter: nói bằng lời điều đang lọc', () => {
  it('khớp tất cả', () => {
    expect(describeTagFilter(['chương 1', 'chương 2', 'vận dụng'], 'all')).toBe(
      '(chương 1 hoặc chương 2) và vận dụng',
    );
  });

  it('một nhóm thì không cần ngoặc', () => {
    expect(describeTagFilter(['chương 1', 'chương 2'], 'all')).toBe('chương 1 hoặc chương 2');
    expect(describeTagFilter(['chương 1', 'ngăn xếp'], 'any')).toBe('chương 1 hoặc ngăn xếp');
    expect(describeTagFilter(['ngăn xếp'], 'all')).toBe('ngăn xếp');
    expect(describeTagFilter([], 'all')).toBe('');
  });
});
