import { describe, expect, it } from 'vitest';
import { formatWhen } from './format';

describe('formatWhen', () => {
  it('ghi giờ Việt Nam kiểu "14:35 ngày 18/11/2026", cùng cách ghi với thư', () => {
    expect(formatWhen('2026-11-18T07:35:00Z')).toBe('14:35 ngày 18/11/2026');
  });

  it('qua nửa đêm giờ Việt Nam thì sang ngày mới (UTC chưa sang)', () => {
    expect(formatWhen('2026-11-17T17:05:00Z')).toBe('00:05 ngày 18/11/2026');
  });
});
