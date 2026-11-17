import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';
import { queryString } from './query-string';

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

/** Bảng theo dõi kích hoạt (7d-2): sáu trạng thái riêng; "Chờ kích hoạt" là nhóm lọc gồm bốn trạng thái đầu. */
export const TRACKING_STATES = [
  'not_sent',
  'sent',
  'mail_failed',
  'needs_check',
  'activated',
  'email_unverified',
] as const;
export type TrackingState = (typeof TRACKING_STATES)[number];
export const AWAITING_STATES: readonly TrackingState[] = [
  'not_sent',
  'sent',
  'mail_failed',
  'needs_check',
];

export interface TrackingRow {
  userId: string;
  fullName: string;
  code: string | null;
  email: string | null;
  state: TrackingState;
  /** Được Gửi lại, Sửa email, Liên kết hỗ trợ (P3); `false` thì chỉ xem trạng thái. */
  actionable: boolean;
}

export interface TrackingPage {
  items: TrackingRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<TrackingState, number>;
}

export interface TrackingFilter {
  state?: TrackingState;
  group?: 'awaiting';
  page?: number;
}

export const trackingQuery = (requestId: string, filter: TrackingFilter) =>
  queryOptions({
    queryKey: ['account-support', 'tracking', requestId, filter],
    queryFn: () =>
      apiFetch<TrackingPage>(`/account-support/tracking${queryString({ requestId, ...filter })}`),
    placeholderData: keepPreviousData,
  });

/** "Gửi lại cho tất cả": Người ra đề tối đa một lần mỗi 6 giờ. */
export const resendAll = (requestId: string) =>
  apiFetch<{ queued: number; skipped: number; recent: number }>('/account-support/resend-all', {
    method: 'POST',
    body: { requestId },
  });

export interface QuotaSnapshot {
  sent24h: number;
  totalLimit: number;
  bulkLimit: number;
  pendingTotal: number;
  mine: { pending: number; ahead: number; estimatedDoneAt: string | null };
}

export const quotaQuery = () =>
  queryOptions({
    queryKey: ['account-support', 'quota'],
    queryFn: () => apiFetch<QuotaSnapshot>('/account-support/quota'),
    refetchInterval: 30_000,
  });

export interface MailQueueItem {
  id: string;
  kind: string;
  lane: 'urgent' | 'bulk';
  toEmail: string;
  status: 'pending' | 'sending' | 'failed' | 'rejected';
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
}

export interface MailQueue {
  sent24h: number;
  totalLimit: number;
  bulkLimit: number;
  counts: Record<'pending' | 'sending' | 'sent' | 'failed' | 'rejected' | 'skipped', number>;
  items: MailQueueItem[];
}

export const mailQueueQuery = () =>
  queryOptions({
    queryKey: ['admin', 'mail-queue'],
    queryFn: () => apiFetch<MailQueue>('/admin/mail-queue'),
    refetchInterval: 15_000,
  });

/** Những người còn Chờ kích hoạt trong Danh sách dự thi của một Phiên thi (tối đa 200 người đầu). */
export const sessionAwaitingQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['account-support', 'tracking-session', sessionId],
    queryFn: () =>
      apiFetch<TrackingPage>(
        `/account-support/tracking${queryString({ sessionId, group: 'awaiting', pageSize: 200 })}`,
      ),
  });
