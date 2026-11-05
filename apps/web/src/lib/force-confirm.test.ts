import { describe, expect, it } from 'vitest';
import {
  confirmMatches,
  confirmPhraseOf,
  type ForceTarget,
  reopenWatchLeftMs,
  undoSecondsLeft,
  undoUntilOfEarliest,
} from './force-confirm';

const person = (over: Partial<ForceTarget> = {}): ForceTarget => ({
  fullName: 'Nguyễn Văn An',
  code: 'SV26101',
  ...over,
});

describe('confirmPhraseOf: điều phải gõ lại để xác nhận Buộc nộp (Q277)', () => {
  it('một người: Mã định danh; không có mã thì họ tên', () => {
    expect(confirmPhraseOf([person()], 'one')).toBe('SV26101');
    expect(confirmPhraseOf([person({ code: null })], 'one')).toBe('Nguyễn Văn An');
  });

  it('nhóm hoặc cả phòng: số người', () => {
    const many = [person(), person({ code: 'SV2' }), person({ code: 'SV3' })];
    expect(confirmPhraseOf(many, 'group')).toBe('3');
    expect(confirmPhraseOf(many, 'all')).toBe('3');
  });

  it('nhóm chỉ có một người vẫn gõ số người (đúng phạm vi nhóm)', () => {
    expect(confirmPhraseOf([person()], 'group')).toBe('1');
  });
});

describe('confirmMatches', () => {
  it('bỏ khoảng trắng hai đầu, không phân biệt hoa thường', () => {
    expect(confirmMatches('  sv26101 ', 'SV26101')).toBe(true);
  });

  it('chữ Việt gõ dạng tổ hợp (NFD) vẫn khớp dạng dựng sẵn (NFC)', () => {
    expect(confirmMatches('Nguyễn Văn An'.normalize('NFD'), 'Nguyễn Văn An')).toBe(true);
  });

  it('sai hoặc rỗng hoặc chỉ khớp một phần thì không', () => {
    expect(confirmMatches('', 'SV26101')).toBe(false);
    expect(confirmMatches('SV2610', 'SV26101')).toBe(false);
    expect(confirmMatches('SV261011', 'SV26101')).toBe(false);
    expect(confirmMatches('120', '12')).toBe(false);
  });
});

describe('undoSecondsLeft: đếm lùi cửa sổ hoàn tác theo giờ server', () => {
  const serverNow = '2026-11-02T08:03:00.000Z';
  const until = '2026-11-02T08:10:00.000Z';

  it('còn 7 phút lúc nhận ảnh chụp, trôi theo đồng hồ đơn điệu', () => {
    expect(undoSecondsLeft(until, serverNow, 0)).toBe(420);
    expect(undoSecondsLeft(until, serverNow, 60_500)).toBe(359);
  });

  it('hết hạn hoặc không có thì 0 / null', () => {
    expect(undoSecondsLeft(until, serverNow, 10 * 60_000)).toBe(0);
    expect(undoSecondsLeft(null, serverNow, 0)).toBeNull();
  });
});

describe('undoUntilOfEarliest', () => {
  it('lấy mốc hết hạn sớm nhất trong những người còn hoàn tác được', () => {
    expect(
      undoUntilOfEarliest([
        { undoUntil: '2026-11-02T08:10:00.000Z' },
        { undoUntil: null },
        { undoUntil: '2026-11-02T08:05:00.000Z' },
      ]),
    ).toBe('2026-11-02T08:05:00.000Z');
    expect(undoUntilOfEarliest([{ undoUntil: null }])).toBeNull();
    expect(undoUntilOfEarliest([])).toBeNull();
  });
});

describe('reopenWatchLeftMs: màn "Đã nộp" còn chờ được mở lại bao lâu (Q279)', () => {
  const serverNow = '2026-11-02T08:20:00.000Z';

  it('theo dõi 15 phút kể từ lúc bị Buộc nộp, trừ thời gian đã trôi', () => {
    expect(reopenWatchLeftMs('2026-11-02T08:10:00.000Z', 'examiner', serverNow, 0)).toBe(
      5 * 60_000,
    );
    expect(reopenWatchLeftMs('2026-11-02T08:10:00.000Z', 'examiner', serverNow, 60_000)).toBe(
      4 * 60_000,
    );
  });

  it('quá 15 phút thì 0', () => {
    expect(reopenWatchLeftMs('2026-11-02T08:00:00.000Z', 'examiner', serverNow, 0)).toBe(0);
    expect(reopenWatchLeftMs('2026-11-02T08:10:00.000Z', 'examiner', serverNow, 6 * 60_000)).toBe(
      0,
    );
  });

  it('chỉ Lượt bị Buộc nộp mới theo dõi; các lý do nộp khác dừng hẳn', () => {
    for (const reason of [
      'candidate',
      'timeout',
      'disqualified',
      'account_locked',
      'session_cancelled',
      null,
    ]) {
      expect(reopenWatchLeftMs('2026-11-02T08:19:00.000Z', reason, serverNow, 0)).toBe(0);
    }
    expect(reopenWatchLeftMs(null, 'examiner', serverNow, 0)).toBe(0);
  });
});
