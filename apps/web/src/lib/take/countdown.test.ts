import { describe, expect, it } from 'vitest';
import { formatCountdown, remainingMs, serverNowOf } from './countdown';

describe('đếm ngược Phòng chờ', () => {
  it('định dạng phút:giây và giờ:phút:giây, làm tròn lên', () => {
    expect(formatCountdown(29 * 60_000 + 5_000)).toBe('29:05');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(400)).toBe('00:01');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('giờ server chạy tiếp theo đồng hồ đơn điệu, không lùi', () => {
    const clock = { serverNowMs: 1_000_000, receivedAt: 500 };
    expect(serverNowOf(clock, 2_500)).toBe(1_002_000);
    expect(serverNowOf(clock, 100)).toBe(1_000_000);
  });

  it('còn lại không âm', () => {
    expect(remainingMs(10_000, 4_000)).toBe(6_000);
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });
});
