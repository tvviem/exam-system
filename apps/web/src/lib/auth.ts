import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiFetch } from './api';
import { forgetOnLogout } from './take/local-data';

export type RoleTag = 'examiner' | 'candidate';

export interface Me {
  id: string;
  fullName: string;
  isAdmin: boolean;
  roleTags: RoleTag[];
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

const ME_KEY = 'exam:me';

const rememberMe = (me: Me | null) => {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    // Không có localStorage: chỉ mất khả năng mở lại trang khi ngoại tuyến.
  }
};

/** Người dùng đăng nhập lần cuối trên máy này; chỉ để mở lại trang làm bài khi mất mạng (Q243). */
const lastKnownMe = (): Me | null => {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
};

/** Không tới được server (mất mạng, cổng web báo 502/503/504). */
const unreachable = (error: unknown) =>
  !(error instanceof ApiError) || [502, 503, 504].includes(error.status);

/** null khi chưa đăng nhập hoặc phiên đã hết hạn. */
export const meQuery = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: async (): Promise<Me | null> => {
    try {
      const me = await apiFetch<Me>('/auth/me');
      rememberMe(me);
      return me;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        rememberMe(null);
        return null;
      }
      // Mất mạng lúc tải lại trang làm bài: dùng người dùng đã biết để mở được bản đề lưu trên máy. Mọi lời gọi tới
      // server vẫn phải có phiên hợp lệ, nên đây chỉ là giao diện, không cấp quyền gì.
      if (unreachable(error)) {
        const known = lastKnownMe();
        if (known) return known;
      }
      throw error;
    }
  },
  staleTime: 60_000,
});

export const authSessionsQuery = queryOptions({
  queryKey: ['auth', 'auth-sessions'],
  queryFn: () => apiFetch<AuthSession[]>('/auth/auth-sessions'),
});

export const login = (identifier: string, password: string) =>
  apiFetch('/auth/login', { method: 'POST', body: { identifier, password } });

export const logout = async () => {
  rememberMe(null);
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    await forgetOnLogout();
  }
};

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });

export const revokeAuthSession = (id: string) =>
  apiFetch(`/auth/auth-sessions/${id}`, { method: 'DELETE' });

/** Trang đầu tiên theo vai trò sau khi đăng nhập. */
export function homePathFor(me: Me): '/admin' | '/examiner' | '/take' | null {
  if (me.isAdmin) return '/admin';
  if (me.roleTags.includes('examiner')) return '/examiner';
  if (me.roleTags.includes('candidate')) return '/take';
  return null;
}

/** Chỉ nhận đường dẫn nội bộ để tránh chuyển hướng ra trang ngoài sau khi đăng nhập. */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : undefined;
}
