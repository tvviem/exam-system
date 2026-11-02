import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, defaultViewMode, parsePrefs } from './prefs';

describe('parsePrefs: tùy chọn hiển thị đọc từ localStorage', () => {
  it('thiếu hoặc hỏng thì dùng mặc định', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('không phải json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS);
  });
  it('giữ giá trị hợp lệ, bỏ giá trị lạ từng trường', () => {
    expect(parsePrefs(JSON.stringify({ viewMode: 'all', fontScale: 115, serif: false }))).toEqual({
      viewMode: 'all',
      fontScale: 115,
      serif: false,
    });
    expect(parsePrefs(JSON.stringify({ fontScale: 999, viewMode: 'x', serif: 'có' }))).toEqual(
      DEFAULT_PREFS,
    );
  });
});

describe('defaultViewMode: mặc định theo bề rộng màn hình (Q240)', () => {
  it('điện thoại một câu, từ 900 px cả đề', () => {
    expect(defaultViewMode(360)).toBe('one');
    expect(defaultViewMode(899)).toBe('one');
    expect(defaultViewMode(900)).toBe('all');
  });
});
