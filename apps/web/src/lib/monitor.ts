import {
  type AttentionReason,
  type DeviceState,
  type ExtendTimeRequest,
  MONITOR_SAFETY_POLL_MS,
  type MonitorState,
  type ViolationRequest,
} from '@exam/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';

// Màn Theo dõi và thao tác của Người ra đề lúc Phiên thi đang diễn ra (docs/plan/slice-4.md, PR 4d).

export interface MonitorPerson {
  userId: string;
  code: string | null;
  fullName: string;
  classLabel: string | null;
  state: MonitorState;
  attemptId: string | null;
  attemptNo: number | null;
  startedAt: string | null;
  deadline: string | null;
  submittedAt: string | null;
  submitReason: string | null;
  answered: number;
  hiddenCount: number;
  warnings: number;
  device: DeviceState;
  /** Thiết bị bị Thu hồi gần nhất: đích của "Hoàn tác Thu hồi". */
  revokedDeviceId: string | null;
  reasons: AttentionReason[];
}

export interface MonitorSnapshot {
  serverNow: string;
  entryClosed: boolean;
  totalItems: number;
  summary: {
    total: number;
    notStarted: number;
    working: number;
    disconnected: number;
    submitted: number;
    suspended: number;
    attention: number;
  };
  people: MonitorPerson[];
}

/** Hỏi lại mỗi 5 giây khi không có kênh đẩy (Q213, Q255). Ẩn tab thì ngừng hỏi. */
export const MONITOR_POLL_MS = 5000;

export const monitorQueryKey = (sessionId: string) => ['sessions', sessionId, 'monitor'] as const;

/**
 * `live`: kênh đẩy đang nối và đã vào phòng, nên tin đẩy (`monitor.changed`) làm tải lại gần tức thì và chỉ còn hỏi lại an
 * toàn 30 giây một lần phòng khi lỡ tin; kênh đứt thì về 5 giây.
 */
export const monitorQuery = (sessionId: string, live = false) =>
  queryOptions({
    queryKey: monitorQueryKey(sessionId),
    queryFn: () => apiFetch<MonitorSnapshot>(`/sessions/${sessionId}/monitor`),
    refetchInterval: live ? MONITOR_SAFETY_POLL_MS : MONITOR_POLL_MS,
    refetchOnWindowFocus: true,
    // Giữ ảnh chụp cũ khi một lần hỏi lỗi (mất mạng thoáng qua) để màn hình không trắng.
    staleTime: 0,
  });

/** Cộng giờ: `attemptIds` là một hoặc một nhóm Lượt, hoặc `scope: 'all'` là cả phòng. */
export type ExtendInput = Omit<ExtendTimeRequest, 'batchId'> & { batchId: string };

export const extendTime = (sessionId: string, body: ExtendInput) =>
  apiFetch<{ extended: number; skipped: number }>(`/sessions/${sessionId}/extend-time`, {
    method: 'POST',
    body,
  });

export const forceSubmit = (sessionId: string, body: { attemptIds: string[] } | { scope: 'all' }) =>
  apiFetch<{ closed: number; skipped: number }>(`/sessions/${sessionId}/force-submit`, {
    method: 'POST',
    body,
  });

export const recordViolation = (sessionId: string, attemptId: string, body: ViolationRequest) =>
  apiFetch<{ id: string }>(`/sessions/${sessionId}/attempts/${attemptId}/violations`, {
    method: 'POST',
    body,
  });

export const setEntryClosed = (sessionId: string, closed: boolean) =>
  apiFetch<{ entryClosedAt: string | null }>(
    `/sessions/${sessionId}/${closed ? 'close-entry' : 'reopen-entry'}`,
    { method: 'POST', body: {} },
  );

export const revokeDevice = (sessionId: string, userId: string, reason: string) =>
  apiFetch<{ ok: true }>(`/sessions/${sessionId}/roster/${userId}/revoke-device`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });

export const pardonDevice = (sessionId: string, userId: string, deviceId: string) =>
  apiFetch<{ ok: true }>(`/sessions/${sessionId}/roster/${userId}/pardon-device`, {
    method: 'POST',
    body: { deviceId },
  });
