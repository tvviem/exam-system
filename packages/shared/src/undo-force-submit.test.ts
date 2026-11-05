import { describe, expect, it } from 'vitest';
import {
  UNDO_FORCE_SUBMIT_WINDOW_MS,
  undoDeadlineOf,
  undoProblemOf,
  undoUntilOf,
} from './undo-force-submit.js';

const at = (iso: string) => new Date(iso);
const submittedAt = at('2026-11-02T09:00:00Z');
const MIN = 60_000;

describe('undoUntilOf: hết cửa sổ hoàn tác lúc nào', () => {
  it('10 phút kể từ lúc bị Buộc nộp', () => {
    expect(UNDO_FORCE_SUBMIT_WINDOW_MS).toBe(10 * MIN);
    expect(undoUntilOf(submittedAt).toISOString()).toBe('2026-11-02T09:10:00.000Z');
  });
});

describe('undoDeadlineOf: hạn mới của Lượt (Q275)', () => {
  const base = {
    submittedAt,
    deadline: at('2026-11-02T09:25:00Z'), // còn 25 phút lúc bị nộp
    now: at('2026-11-02T09:04:00Z'),
    hardClose: false,
    closesAt: at('2026-11-02T12:00:00Z'),
  };

  it('hạn mới = lúc hoàn tác + phần thời gian còn lại lúc bị nộp', () => {
    expect(undoDeadlineOf(base)?.toISOString()).toBe('2026-11-02T09:29:00.000Z');
  });

  it('Cắt cứng thì không vượt giờ đóng', () => {
    const near = { ...base, hardClose: true, closesAt: at('2026-11-02T09:20:00Z') };
    expect(undoDeadlineOf(near)?.toISOString()).toBe('2026-11-02T09:20:00.000Z');
  });

  it('không Cắt cứng thì được vượt giờ đóng (đủ Thời lượng)', () => {
    const past = { ...base, closesAt: at('2026-11-02T09:10:00Z') };
    expect(undoDeadlineOf(past)?.toISOString()).toBe('2026-11-02T09:29:00.000Z');
  });

  it('Lượt đã quá hạn lúc bị nộp (hạn <= lúc nộp) thì không có hạn mới', () => {
    expect(undoDeadlineOf({ ...base, deadline: submittedAt })).toBeNull();
    expect(undoDeadlineOf({ ...base, deadline: at('2026-11-02T08:59:00Z') })).toBeNull();
  });

  it('Cắt cứng mà giờ đóng đã qua thì không có hạn mới', () => {
    const closed = { ...base, hardClose: true, closesAt: at('2026-11-02T09:03:00Z') };
    expect(undoDeadlineOf(closed)).toBeNull();
  });
});

describe('undoProblemOf: lý do từ chối (Q276)', () => {
  const ok = {
    status: 'submitted' as const,
    submitReason: 'examiner' as const,
    submittedAt,
    deadline: at('2026-11-02T09:30:00Z'),
    now: at('2026-11-02T09:05:00Z'),
    sessionCancelled: false,
    hasNewerAttempt: false,
  };

  it('đủ điều kiện thì không có vấn đề', () => {
    expect(undoProblemOf(ok)).toBeNull();
  });

  it('ranh giới: đúng 10 phút còn hoàn tác được, quá 1 ms thì không', () => {
    expect(undoProblemOf({ ...ok, now: at('2026-11-02T09:10:00.000Z') })).toBeNull();
    expect(undoProblemOf({ ...ok, now: at('2026-11-02T09:10:00.001Z') })).toBe(
      'UNDO_WINDOW_PASSED',
    );
  });

  it('Lượt chưa nộp hoặc nộp vì lý do khác không hoàn tác được', () => {
    expect(undoProblemOf({ ...ok, status: 'in_progress' as never })).toBe('NOT_FORCE_SUBMITTED');
    for (const reason of [
      'candidate',
      'timeout',
      'disqualified',
      'account_locked',
      'session_cancelled',
    ] as const) {
      expect(undoProblemOf({ ...ok, submitReason: reason })).toBe('NOT_FORCE_SUBMITTED');
    }
  });

  it('Phiên thi đã Hủy, đã có Lượt mới, hay hết giờ lúc bị nộp thì mỗi cái một mã', () => {
    expect(undoProblemOf({ ...ok, sessionCancelled: true })).toBe('SESSION_CANCELLED');
    expect(undoProblemOf({ ...ok, hasNewerAttempt: true })).toBe('NEW_ATTEMPT_STARTED');
    expect(undoProblemOf({ ...ok, deadline: at('2026-11-02T08:59:00Z') })).toBe('ATTEMPT_EXPIRED');
  });

  it('thứ tự ưu tiên: không phải Buộc nộp trước, rồi Hủy, rồi Lượt mới, rồi hết giờ, cuối cùng quá cửa sổ', () => {
    const all = {
      ...ok,
      sessionCancelled: true,
      hasNewerAttempt: true,
      deadline: at('2026-11-02T08:59:00Z'),
      now: at('2026-11-02T09:30:00Z'),
    };
    expect(undoProblemOf({ ...all, submitReason: 'candidate' })).toBe('NOT_FORCE_SUBMITTED');
    expect(undoProblemOf(all)).toBe('SESSION_CANCELLED');
    expect(undoProblemOf({ ...all, sessionCancelled: false })).toBe('NEW_ATTEMPT_STARTED');
    expect(undoProblemOf({ ...all, sessionCancelled: false, hasNewerAttempt: false })).toBe(
      'ATTEMPT_EXPIRED',
    );
    expect(
      undoProblemOf({
        ...all,
        sessionCancelled: false,
        hasNewerAttempt: false,
        deadline: at('2026-11-02T09:40:00Z'),
      }),
    ).toBe('UNDO_WINDOW_PASSED');
  });
});
