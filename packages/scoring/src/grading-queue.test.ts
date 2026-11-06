import { describe, expect, it } from 'vitest';
import { countableAttempts, stableHash, stableOrder, verdictOfScore } from './grading-queue.js';

describe('stableOrder: thứ tự ngẫu nhiên nhưng cố định (Q291)', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `attempt-${i}`);

  it('cùng đầu vào luôn ra cùng thứ tự, không phụ thuộc thứ tự đầu vào', () => {
    const a = stableOrder(ids, (x) => x, 'phien-1:cau-1');
    const b = stableOrder([...ids].reverse(), (x) => x, 'phien-1:cau-1');
    expect(a).toEqual(b);
  });

  it('khác hàng đợi (salt) thì thứ tự khác; khác thứ tự nhập', () => {
    const a = stableOrder(ids, (x) => x, 'phien-1:cau-1');
    const b = stableOrder(ids, (x) => x, 'phien-1:cau-2');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(ids);
    expect(new Set(a)).toEqual(new Set(ids));
  });

  it('băm là số nguyên không âm ổn định', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).toBeGreaterThanOrEqual(0);
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
  });
});

describe('countableAttempts: Lượt có thể được tính (Q292)', () => {
  const attempts = [
    { attemptId: 'a1', userId: 'an', attemptNo: 1 },
    { attemptId: 'a2', userId: 'an', attemptNo: 2 },
    { attemptId: 'b1', userId: 'binh', attemptNo: 1 },
  ];
  it('highest: mọi Lượt đã nộp', () => {
    expect(countableAttempts(attempts, 'highest').map((a) => a.attemptId)).toEqual([
      'a1',
      'a2',
      'b1',
    ]);
  });
  it('latest: chỉ Lượt cuối của mỗi người', () => {
    expect(
      countableAttempts(attempts, 'latest')
        .map((a) => a.attemptId)
        .sort(),
    ).toEqual(['a2', 'b1']);
  });
});

describe('verdictOfScore', () => {
  it('chờ chấm, đúng, sai, một phần', () => {
    expect(verdictOfScore(null, 2)).toBe('pending');
    expect(verdictOfScore(2, 2)).toBe('correct');
    expect(verdictOfScore(0, 2)).toBe('wrong');
    expect(verdictOfScore(0.5, 2)).toBe('partial');
  });
});
