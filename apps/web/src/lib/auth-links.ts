import { apiFetch } from './api';

/** Hai loại liên kết người dùng tự dùng ở trang công khai (liên kết hỗ trợ và đổi email chưa mở ở PR này). */
export type LinkPurpose = 'activation' | 'password_reset';

export type LinkState =
  | { state: 'ok'; expiresAt: string }
  | { state: 'unknown' }
  | { state: 'expired'; expiredAt: string }
  | { state: 'used'; usedAt: string }
  | { state: 'replaced' }
  | { state: 'blocked' };

/** Mã đi trong thân yêu cầu (POST), không ở URL, nên không vào nhật ký máy chủ. */
export const linkStatus = (purpose: LinkPurpose, token: string) =>
  apiFetch<LinkState>('/auth/links/status', { method: 'POST', body: { purpose, token } });

export const consumeLink = (purpose: LinkPurpose, token: string, newPassword: string) =>
  apiFetch<{ state: 'ok' } | Exclude<LinkState, { state: 'ok' }>>('/auth/links/consume', {
    method: 'POST',
    body: { purpose, token, newPassword },
  });

export const forgotPassword = (identifier: string) =>
  apiFetch<{ ok: true }>('/auth/forgot-password', { method: 'POST', body: { identifier } });

let taken = '';

/**
 * Mã nằm ở mảnh `#` của đường dẫn (không bao giờ gửi lên máy chủ, không vào log hay `Referer`). Đọc một lần rồi xóa khỏi
 * thanh địa chỉ để khỏi nằm trong lịch sử; giữ trong bộ nhớ để React (StrictMode gọi hai lần) vẫn đọc được.
 */
export function takeTokenFromHash(): string {
  const hash = window.location.hash.slice(1);
  if (hash) {
    taken = hash;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return taken;
}
