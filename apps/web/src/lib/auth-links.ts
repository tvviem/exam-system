import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/** Hai loại liên kết đặt mật khẩu ở trang công khai. */
export type PasswordPurpose = 'activation' | 'password_reset';
/** Thêm liên kết xác nhận email (trang /verify-email); liên kết hỗ trợ chưa mở (7d). */
export type LinkPurpose = PasswordPurpose | 'email_change';

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

export const consumeLink = (purpose: PasswordPurpose, token: string, newPassword: string) =>
  apiFetch<{ state: 'ok' } | Exclude<LinkState, { state: 'ok' }>>('/auth/links/consume', {
    method: 'POST',
    body: { purpose, token, newPassword },
  });

export type EmailConfirmState =
  | { state: 'ok' }
  | Exclude<LinkState, { state: 'ok' }>
  | { state: 'email_taken' };

/** Bấm liên kết xác nhận email: email chỉ đổi (hoặc được xác thực) lúc này; không cần đăng nhập. */
export const confirmEmail = (token: string) =>
  apiFetch<EmailConfirmState>('/auth/links/consume', {
    method: 'POST',
    body: { purpose: 'email_change', token },
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

/**
 * Như `takeTokenFromHash` nhưng theo dõi cả khi người dùng dán một liên kết khác vào cùng tab (chỉ đổi mảnh `#`, trang không tải
 * lại): trả mã mới để trang dùng làm `key` và dựng lại từ đầu thay vì giữ kết quả của liên kết cũ.
 */
export function useLinkToken(): string {
  const [token, setToken] = useState(takeTokenFromHash);
  useEffect(() => {
    const onChange = () => {
      const next = takeTokenFromHash();
      if (next) setToken(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return token;
}
