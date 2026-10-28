import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiFetch } from './api';

export type RoleTag = 'examiner' | 'candidate';

export interface Me {
  id: string;
  fullName: string;
  isAdmin: boolean;
  tags: RoleTag[];
  mustChangePassword: boolean;
}

export interface AuthSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** null khi chưa đăng nhập hoặc phiên đã hết hạn. */
export const meQuery = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await apiFetch<Me>('/auth/me');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 60_000,
});

export const sessionsQuery = queryOptions({
  queryKey: ['auth', 'sessions'],
  queryFn: () => apiFetch<AuthSession[]>('/auth/sessions'),
});

export const login = (identifier: string, password: string) =>
  apiFetch('/auth/login', { method: 'POST', body: { identifier, password } });

export const logout = () => apiFetch('/auth/logout', { method: 'POST' });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });

export const revokeSession = (id: string) => apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' });

/** Trang đầu tiên theo vai trò sau khi đăng nhập. */
export function homePathFor(me: Me): '/admin' | '/examiner' | '/take' | null {
  if (me.isAdmin) return '/admin';
  if (me.tags.includes('examiner')) return '/examiner';
  if (me.tags.includes('candidate')) return '/take';
  return null;
}

/** Chỉ nhận đường dẫn nội bộ để tránh chuyển hướng ra trang ngoài sau khi đăng nhập. */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : undefined;
}
