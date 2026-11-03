import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { retryDelay, shouldRetry } from './query-policy';

// Phản hồi tức thời là yêu cầu hàng đầu: lỗi không thể tự hết (4xx) phải hiện ngay, lỗi tạm thời (mạng, 5xx) chỉ thử
// lại thật nhanh, tổng chờ dưới 1 giây.

describe('chính sách thử lại truy vấn', () => {
  it('lỗi của yêu cầu (400–499) không thử lại: báo ngay', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldRetry(0, new ApiError(status, 'X'))).toBe(false);
    }
  });

  it('lỗi mạng và lỗi server (5xx) thử lại tối đa 2 lần', () => {
    for (const error of [new TypeError('Failed to fetch'), new ApiError(503, 'X')]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(false);
    }
  });

  it('tổng thời gian chờ giữa các lần thử dưới 1 giây', () => {
    expect(retryDelay(0) + retryDelay(1)).toBeLessThan(1000);
    expect(retryDelay(0)).toBeGreaterThan(0);
  });
});
