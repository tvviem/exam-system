import { describe, expect, it } from 'vitest';
import { describeTagFilter, LEVEL_TAGS, tagKind } from './tag-filter.js';
import { TAG_GUIDE, TAG_GUIDE_EXAMPLE } from './tag-guide.js';

const all = TAG_GUIDE.map((rule) => `${rule.title} ${rule.text}`).join('\n');

describe('hướng dẫn đặt tag khớp với cách hệ thống xếp loại', () => {
  it('ví dụ gồm đúng một tag chương, một mức độ, một tag nội dung', () => {
    expect(TAG_GUIDE_EXAMPLE.split(', ').map(tagKind)).toEqual(['chương', 'mức độ', null]);
  });

  it('nêu đủ bốn mức độ', () => {
    for (const level of LEVEL_TAGS) expect(all).toContain(level);
  });

  it('cách viết nên tránh đúng là không được nhận là loại chương, cách viết mẫu thì được', () => {
    expect(tagKind('chương ii')).toBeNull();
    expect(tagKind('c2')).toBeNull();
    expect(tagKind('chương 2')).toBe('chương');
    expect(tagKind('chuẩn: clo1')).toBe('chuẩn');
    expect(all).toContain('chuẩn: clo1');
  });

  it('ví dụ về cách lọc đúng như hệ thống mô tả', () => {
    expect(all).toContain(describeTagFilter(['chương 1', 'chương 2', 'vận dụng'], 'all'));
  });
});
