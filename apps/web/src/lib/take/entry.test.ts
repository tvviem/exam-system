import { describe, expect, it } from 'vitest';
import { entryActionOf, groupOf, normalizeCode, resumeTargetOf, type SessionRow } from './entry';

const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  phase: 'open',
  deviceStatus: 'none',
  inProgressAttemptId: null,
  attemptsUsed: 0,
  maxAttempts: 1,
  canWait: false,
  waitingRoom: false,
  resultReleased: false,
  ...over,
});

describe('normalizeCode: ô nhập Mã vào thi', () => {
  it.each([
    ['abc123', 'ABC123'],
    ['  abc 123 ', 'ABC123'],
    ['ab-c1-23', 'ABC123'],
    ['a\tb', 'AB'],
  ])('%j thành %j', (input, out) => {
    expect(normalizeCode(input)).toBe(out);
  });
});

describe('entryActionOf: nút ở mỗi dòng "Phiên thi của tôi"', () => {
  it.each([
    ['chưa gắn thiết bị: nhập mã', row(), 'enter-code'],
    [
      'thiết bị khác đang gắn: nhập mã (server sẽ báo)',
      row({ deviceStatus: 'other' }),
      'enter-code',
    ],
    ['đã gắn thiết bị này, còn lượt: bắt đầu', row({ deviceStatus: 'active' }), 'start'],
    [
      'có Lượt dở trên thiết bị này: làm tiếp',
      row({ deviceStatus: 'active', inProgressAttemptId: 'a1' }),
      'resume',
    ],
    [
      'có Lượt dở nhưng thiết bị bị thu hồi',
      row({ deviceStatus: 'revoked', inProgressAttemptId: 'a1' }),
      'revoked',
    ],
    ['thiết bị này bị thu hồi', row({ deviceStatus: 'revoked' }), 'revoked'],
    ['hết lượt', row({ deviceStatus: 'active', attemptsUsed: 1 }), 'finished'],
    ['chưa mở', row({ phase: 'upcoming' }), 'wait'],
    ['Đóng cửa vào thi, chưa vào', row({ phase: 'entry_closed' }), 'closed'],
    [
      'Đóng cửa vào thi nhưng đang làm dở',
      row({ phase: 'entry_closed', deviceStatus: 'active', inProgressAttemptId: 'a1' }),
      'resume',
    ],
    ['đã đóng, chưa làm', row({ phase: 'closed' }), 'closed'],
    ['đã đóng, đã làm', row({ phase: 'closed', attemptsUsed: 1 }), 'finished'],
    ['đã hủy', row({ phase: 'cancelled' }), 'closed'],
  ])('%s', (_name, input, action) => {
    expect(entryActionOf(input)).toBe(action);
  });
});

describe('groupOf: ba nhóm Đang mở / Sắp mở / Đã xong (Q206)', () => {
  it.each([
    [row(), 'open'],
    [row({ phase: 'upcoming' }), 'upcoming'],
    [row({ phase: 'closed' }), 'finished'],
    [row({ phase: 'cancelled' }), 'finished'],
    [row({ phase: 'entry_closed' }), 'finished'],
    [row({ phase: 'entry_closed', inProgressAttemptId: 'a1' }), 'open'],
    [row({ attemptsUsed: 1 }), 'finished'],
    [row({ attemptsUsed: 1, inProgressAttemptId: 'a1' }), 'open'],
  ])('%j thuộc nhóm %s', (input, group) => {
    expect(groupOf(input)).toBe(group);
  });
});

describe('resumeTargetOf: đăng nhập xong đi thẳng đến chỗ đang làm', () => {
  const r = (over: Partial<SessionRow>) => ({ ...row(over), sessionId: 's' });
  it('đúng một Lượt đang làm: vào thẳng Lượt đó', () => {
    expect(resumeTargetOf([r({ inProgressAttemptId: 'a1', deviceStatus: 'active' })])).toEqual({
      kind: 'attempt',
      attemptId: 'a1',
    });
  });
  it('không có Lượt, đúng một Phòng chờ: về Phòng chờ', () => {
    expect(
      resumeTargetOf([
        r({ phase: 'upcoming', deviceStatus: 'active', canWait: true, waitingRoom: true }),
      ]),
    ).toEqual({ kind: 'session', sessionId: 's' });
  });
  it('nhiều Lượt đang làm, hoặc không có gì: để chọn trong danh sách', () => {
    expect(
      resumeTargetOf([r({ inProgressAttemptId: 'a1' }), r({ inProgressAttemptId: 'a2' })]),
    ).toBeNull();
    expect(resumeTargetOf([r({ phase: 'upcoming' })])).toBeNull();
    expect(resumeTargetOf([])).toBeNull();
  });
});

describe('Phòng chờ trong "Phiên thi của tôi" (Q284)', () => {
  it('sắp mở, đã nhập mã trên thiết bị này: vào Phòng chờ, nằm nhóm riêng', () => {
    const waiting = row({
      phase: 'upcoming',
      deviceStatus: 'active',
      canWait: true,
      waitingRoom: true,
    });
    expect(entryActionOf(waiting)).toBe('waiting');
    expect(groupOf(waiting)).toBe('waiting');
  });

  it('sắp mở, đã tới cửa sổ 30 phút nhưng chưa nhập mã: nhập mã để vào Phòng chờ', () => {
    const early = row({ phase: 'upcoming', canWait: true });
    expect(entryActionOf(early)).toBe('enter-code');
    expect(groupOf(early)).toBe('upcoming');
  });

  it('sắp mở, còn xa giờ mở: chỉ chờ', () => {
    expect(entryActionOf(row({ phase: 'upcoming' }))).toBe('wait');
  });
});

describe('Kết quả đã Công bố (PR 5c)', () => {
  it('Phiên thi đã Công bố thì hành động chính là xem Kết quả, kể cả khi đã hết lượt', () => {
    expect(entryActionOf(row({ phase: 'closed', attemptsUsed: 1, resultReleased: true }))).toBe(
      'result',
    );
    expect(entryActionOf(row({ phase: 'closed', attemptsUsed: 1 }))).toBe('finished');
  });
  it('Lượt đang làm vẫn được làm tiếp trước khi nói tới Kết quả', () => {
    expect(
      entryActionOf(
        row({ inProgressAttemptId: 'a1', deviceStatus: 'active', resultReleased: true }),
      ),
    ).toBe('resume');
  });
});
