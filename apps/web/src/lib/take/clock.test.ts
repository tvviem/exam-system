import { describe, expect, it } from 'vitest';
import { formatClock, remainingMs, type ServerTime, warningOf } from './clock';

const sync: ServerTime = {
  deadline: '2026-11-02T08:30:00.000Z',
  serverNow: '2026-11-02T08:00:00.000Z',
  receivedAt: 1_000,
};

describe('remainingMs: đồng hồ tính từ giờ của server, không từ giờ máy', () => {
  it('lúc vừa nhận còn đủ 30 phút', () => {
    expect(remainingMs(sync, 1_000)).toBe(30 * 60_000);
  });
  it('trôi theo đồng hồ đơn điệu của trình duyệt', () => {
    expect(remainingMs(sync, 1_000 + 65_000)).toBe(30 * 60_000 - 65_000);
  });
  it('không âm quá mức: quá hạn thì trả giá trị âm để biết đã hết giờ', () => {
    expect(remainingMs(sync, 1_000 + 31 * 60_000)).toBeLessThan(0);
  });
  it('nhận lại deadline mới (Cộng giờ) thì cộng thêm đúng phần được cộng', () => {
    const more = { ...sync, deadline: '2026-11-02T08:40:00.000Z' };
    expect(remainingMs(more, 1_000)).toBe(40 * 60_000);
  });
});

describe('warningOf: mốc cảnh báo', () => {
  it.each([
    [30 * 60_000, 'none'],
    [5 * 60_000 + 1, 'none'],
    [5 * 60_000, 'five'],
    [60_001, 'five'],
    [60_000, 'one'],
    [1, 'one'],
    [0, 'over'],
    [-5_000, 'over'],
  ])('còn %d ms là %s', (ms, level) => {
    expect(warningOf(ms)).toBe(level);
  });
});

describe('formatClock', () => {
  it.each([
    [90 * 60_000 + 5_000, '1:30:05'],
    [59 * 60_000 + 59_000, '59:59'],
    [5_400, '00:06'],
    [0, '00:00'],
    [-3_000, '00:00'],
  ])('%d ms hiện %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});
