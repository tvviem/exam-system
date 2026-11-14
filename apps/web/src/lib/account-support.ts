import { apiFetch } from './api';

/** Hỗ trợ kích hoạt (7d-1): Gửi lại, Sửa email, Liên kết hỗ trợ. Quyền do máy chủ quyết định theo vai trò. */
export const resendSupport = (userId: string) =>
  apiFetch<{ ok: true }>(`/account-support/${userId}/resend`, { method: 'POST' });

export const changeSupportEmail = (userId: string, body: { email: string; reason: string }) =>
  apiFetch<{ ok: true }>(`/account-support/${userId}/email`, { method: 'POST', body });

export interface SupportLink {
  link: string;
  expiresAt: string;
  purpose: 'activation' | 'password_reset';
}

export const createSupportLink = (userId: string, body: { reason: string }) =>
  apiFetch<SupportLink>(`/account-support/${userId}/link`, { method: 'POST', body });
