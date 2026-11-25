import { ApiError } from './api';

// Phản hồi tức thời là yêu cầu hàng đầu (người dùng chờ quá 2–3 giây là đã chậm). Mặc định của TanStack Query thử lại 3 lần
// cách 1, 2, 4 giây (≈ 7 giây) cho mọi lỗi, nên một trang 404 hay 403 chỉ báo lỗi sau ~7 giây dù không thể tự hết.

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 200;

/**
 * Lỗi của yêu cầu (4xx) báo ngay; chỉ lỗi mạng và lỗi server mới thử lại, tối đa hai lần. `SERVER_BUSY` cũng báo ngay: máy chủ đã
 * cho yêu cầu chờ tới lượt, gửi lại tự động chỉ làm hàng đợi dài thêm.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  if (error instanceof ApiError && error.code === 'SERVER_BUSY') return false;
  return failureCount < MAX_RETRIES;
}

/** 200 ms rồi 400 ms: tổng dưới 1 giây. */
export const retryDelay = (attempt: number): number => BASE_DELAY_MS * 2 ** attempt;
