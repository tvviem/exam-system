import { describe, expect, it } from 'vitest';
import { NUDGE_JITTER_MAX_MS, NUDGE_SPREAD_MAX_MS, nudgeSpreadMs } from './realtime.js';

describe('nudgeSpreadMs: khoảng trải heartbeat vì tin đẩy', () => {
  it('một người hay một nhóm nhỏ chỉ trải như cũ (không làm chậm Cảnh cáo, Thu hồi một người)', () => {
    expect(nudgeSpreadMs(1)).toBe(NUDGE_JITTER_MAX_MS);
    expect(nudgeSpreadMs(50)).toBe(NUDGE_JITTER_MAX_MS);
  });

  it('cả phòng thì trải rộng ra theo số người, 120 người ra 480 ms', () => {
    expect(nudgeSpreadMs(120)).toBe(480);
    expect(nudgeSpreadMs(300)).toBe(1200);
  });

  it('có trần: 500 người trải đúng 2 giây, nhiều hơn nữa cũng không hơn', () => {
    expect(nudgeSpreadMs(500)).toBe(NUDGE_SPREAD_MAX_MS);
    expect(nudgeSpreadMs(5000)).toBe(NUDGE_SPREAD_MAX_MS);
  });
});
