import type { WaitingState } from '@exam/shared';
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
  /** Còn Hoàn tác Buộc nộp được đến lúc này (Q278); `null` nếu không hoàn tác được. */
  undoUntil: string | null;
  answered: number;
  hiddenCount: number;
  warnings: number;
  device: DeviceState;
  /** Thiết bị bị Thu hồi gần nhất: đích của "Hoàn tác Thu hồi". */
  revokedDeviceId: string | null;
  reasons: AttentionReason[];
  /** Chỉ có nghĩa khi `state = not_started`: đã nhập mã vào Phòng chờ (Q284). */
  waiting: WaitingState;
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
    /** Số Lượt đang Hoàn tác Buộc nộp được. */
    undoable: number;
    /** Số người đã nhập mã (có thiết bị) mà chưa có Lượt, và số đang trực tuyến trong Phòng chờ. */
    joined: number;
    waitingOnline: number;
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

/** Hoàn tác Buộc nộp một Lượt; lỗi `409 INVALID_STATE` mang `reason` (Q276). */
export const undoForceSubmit = (sessionId: string, attemptId: string) =>
  apiFetch<{ attemptId: string; deadline: string }>(
    `/sessions/${sessionId}/attempts/${attemptId}/undo-force-submit`,
    { method: 'POST', body: {} },
  );

/** Hoàn tác mọi Lượt bị Buộc nộp trong 10 phút qua (Q278). */
export const undoForceSubmitAll = (sessionId: string) =>
  apiFetch<{ reopened: number; skipped: { attemptId: string; problem: string }[] }>(
    `/sessions/${sessionId}/undo-force-submit`,
    { method: 'POST', body: {} },
  );

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
