import { describe, expect, it } from 'vitest';
import {
  existingMatchCount,
  isExistingMatch,
  MATCH_TONE,
  type MatchStatus,
} from './account-requests';

// Người ra đề phải thấy riêng các dòng khớp người ĐÃ CÓ tài khoản (kể cả đã Xóa): họ không nhận thư kích hoạt mới như người mới.
describe('dòng khớp người đã có tài khoản', () => {
  it.each([
    ['new', false],
    ['exact', true],
    ['name_mismatch', true],
    ['restore', true],
    ['blocked', false],
  ] as [MatchStatus, boolean][])('U-01: %s → %s', (status, expected) => {
    expect(isExistingMatch(status)).toBe(expected);
  });

  it('U-02: đếm gộp ba loại khớp, không tính Người mới và dòng bị chặn', () => {
    const counts: Record<MatchStatus, number> = {
      new: 10,
      exact: 4,
      name_mismatch: 2,
      restore: 1,
      blocked: 3,
    };
    expect(existingMatchCount(counts)).toBe(7);
    expect(existingMatchCount({ new: 5, exact: 0, name_mismatch: 0, restore: 0, blocked: 0 })).toBe(
      0,
    );
  });
});

describe('tông màu huy hiệu khớp', () => {
  it('U-03: ba loại khớp người đã có tài khoản cùng tông cảnh báo (không phải xanh lá báo "ổn"), khác tông của Người mới', () => {
    for (const status of ['exact', 'name_mismatch', 'restore'] as MatchStatus[]) {
      expect(MATCH_TONE[status], status).toBe('warning');
    }
    expect(MATCH_TONE.new).toBe('primary');
    expect(MATCH_TONE.blocked).toBe('danger');
    // Mọi trạng thái được coi là "đã có tài khoản" phải mang tông cảnh báo: hai bảng không được lệch nhau.
    for (const status of Object.keys(MATCH_TONE) as MatchStatus[]) {
      expect(isExistingMatch(status), status).toBe(MATCH_TONE[status] === 'warning');
    }
  });
});
