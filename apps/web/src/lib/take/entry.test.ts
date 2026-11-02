import { describe, expect, it } from 'vitest';
import { entryActionOf, groupOf, normalizeCode, type SessionRow } from './entry';

const row = (over: Partial<SessionRow> = {}): SessionRow => ({
  phase: 'open',
  deviceStatus: 'none',
  inProgressAttemptId: null,
  attemptsUsed: 0,
  maxAttempts: 1,
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
