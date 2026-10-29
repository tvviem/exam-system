import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface AppNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  unreadCount: number;
  items: AppNotification[];
}

/** Chuông hỏi mỗi 60 giây và khi người dùng quay lại tab (Q95); từ lát cắt 4 sẽ chuyển sang đẩy. */
export const notificationsQuery = queryOptions({
  queryKey: ['notifications'],
  queryFn: () => apiFetch<NotificationList>('/notifications'),
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
});

/** Không truyền `ids` = đánh dấu tất cả đã đọc. */
export const markNotificationsRead = (ids?: string[]) =>
  apiFetch<NotificationList>('/notifications/read', {
    method: 'POST',
    body: ids ? { ids } : {},
  });
