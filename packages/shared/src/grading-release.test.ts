import { describe, expect, it } from 'vitest';
import { isSessionFinished, releaseBlockers, resultBandOf } from './grading.js';

const ok = {
  released: false,
  cancelled: false,
  finished: true,
  submittedAttempts: 5,
  ungradedAttempts: 0,
  pendingEssays: 0,
};

describe('releaseBlockers (Q298)', () => {
  it('đủ điều kiện thì không có lý do chặn', () => {
    expect(releaseBlockers(ok)).toEqual([]);
  });
  it('báo mọi lý do đang chặn theo thứ tự ưu tiên', () => {
    expect(
      releaseBlockers({
        released: true,
        cancelled: true,
        finished: false,
        submittedAttempts: 0,
        ungradedAttempts: 2,
        pendingEssays: 3,
      }),
    ).toEqual([
      'ALREADY_RELEASED',
      'SESSION_CANCELLED',
      'SESSION_NOT_FINISHED',
      'NO_ATTEMPTS',
      'UNGRADED_ATTEMPTS',
      'ESSAYS_PENDING',
    ]);
  });
  it('từng lý do riêng lẻ', () => {
    expect(releaseBlockers({ ...ok, pendingEssays: 1 })).toEqual(['ESSAYS_PENDING']);
    expect(releaseBlockers({ ...ok, ungradedAttempts: 1 })).toEqual(['UNGRADED_ATTEMPTS']);
    expect(releaseBlockers({ ...ok, submittedAttempts: 0 })).toEqual(['NO_ATTEMPTS']);
  });
});

describe('isSessionFinished', () => {
  const closesAt = new Date('2026-11-02T10:00:00Z');
  const before = new Date('2026-11-02T09:00:00Z');
  const after = new Date('2026-11-02T10:00:00Z');
  it('còn Lượt đang làm thì chưa kết thúc dù đã quá giờ', () => {
    expect(
      isSessionFinished({ now: after, closesAt, entryClosedAt: null, inProgressAttempts: 1 }),
    ).toBe(false);
  });
  it('hết Khung giờ hoặc đã Đóng cửa vào thi (và không còn Lượt đang làm) là kết thúc', () => {
    expect(
      isSessionFinished({ now: after, closesAt, entryClosedAt: null, inProgressAttempts: 0 }),
    ).toBe(true);
    expect(
      isSessionFinished({ now: before, closesAt, entryClosedAt: before, inProgressAttempts: 0 }),
    ).toBe(true);
  });
  it('còn trong Khung giờ và chưa đóng cửa thì chưa kết thúc', () => {
    expect(
      isSessionFinished({ now: before, closesAt, entryClosedAt: null, inProgressAttempts: 0 }),
    ).toBe(false);
  });
});

describe('resultBandOf: dải màu theo mức đạt', () => {
  it('dưới 50 → low; 50–<70 → fair; 70–<90 → good; từ 90 → excellent', () => {
    expect([0, 49.99].map(resultBandOf)).toEqual(['low', 'low']);
    expect([50, 69.99].map(resultBandOf)).toEqual(['fair', 'fair']);
    expect([70, 89.99].map(resultBandOf)).toEqual(['good', 'good']);
    expect([90, 100].map(resultBandOf)).toEqual(['excellent', 'excellent']);
  });
});
