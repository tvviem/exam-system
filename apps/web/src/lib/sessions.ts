import type { SessionPhase } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';

// Phiên thi và Danh sách dự thi (docs/plan/slice-4.md, Q192–Q222).

export { SESSION_PHASES } from '@exam/shared';
export type { SessionPhase };

export interface SessionSummary {
  id: string;
  examId: string;
  examTitle: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  hardClose: boolean;
  maxAttempts: number;
  attemptScoring: 'highest' | 'latest';
  shuffleItems: boolean;
  shuffleOptions: boolean;
  showScoringRules: boolean;
  reviewAfterRelease: boolean;
  /** Đã Công bố / đã Chốt kết quả (Q299); chỉ có ở danh sách và chi tiết. */
  resultReleased: boolean;
  resultFinalized: boolean;
  accessCode: string;
  entryClosedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  version: number;
  rosterCount: number;
  phase: SessionPhase;
}

/** Thiết lập gửi lên khi tạo; sửa thêm `version`. Giờ là ISO có múi giờ. */
export interface SessionInput {
  examId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: number;
  hardClose: boolean;
  maxAttempts: number;
  attemptScoring: 'highest' | 'latest';
  shuffleItems: boolean;
  shuffleOptions: boolean;
  showScoringRules: boolean;
  reviewAfterRelease: boolean;
  accessCode?: string;
}

export interface SessionListParams {
  phase?: SessionPhase;
  q?: string;
  page?: number;
}

export const sessionsQuery = (params: SessionListParams) =>
  queryOptions({
    queryKey: ['sessions', 'list', params],
    queryFn: () => apiFetch<PageResult<SessionSummary>>(`/sessions${queryString({ ...params })}`),
    placeholderData: keepPreviousData,
  });

export const sessionQuery = (id: string) =>
  queryOptions({
    queryKey: ['sessions', 'detail', id],
    queryFn: () => apiFetch<SessionSummary>(`/sessions/${id}`),
  });

export const accessCodeSuggestionQuery = (opensAt: string, closesAt: string, nonce: number) =>
  queryOptions({
    queryKey: ['sessions', 'access-code', opensAt, closesAt, nonce],
    queryFn: () =>
      apiFetch<{ accessCode: string }>(
        `/sessions/access-code-suggestion${queryString({ opensAt, closesAt })}`,
      ),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });

export const createSession = (input: SessionInput) =>
  apiFetch<SessionSummary>('/sessions', { method: 'POST', body: input });
export const saveSession = (id: string, input: SessionInput & { version: number }) =>
  apiFetch<SessionSummary>(`/sessions/${id}`, { method: 'PUT', body: input });
export const duplicateSession = (id: string) =>
  apiFetch<SessionSummary>(`/sessions/${id}/duplicate`, { method: 'POST' });
export const cancelSession = (id: string, reason?: string) =>
  apiFetch<SessionSummary>(`/sessions/${id}/cancel`, { method: 'POST', body: { reason } });
export const deleteSession = (id: string) =>
  apiFetch<null>(`/sessions/${id}`, { method: 'DELETE' });

// Danh sách dự thi (Q200).

export interface RosterItem {
  userId: string;
  code: string | null;
  fullName: string;
  classLabel: string | null;
  extraMinutes: number;
  addedAt: string;
}

export interface RosterSearchResult {
  users: {
    userId: string;
    code: string | null;
    fullName: string;
    classLabel: string | null;
    inRoster: boolean;
  }[];
  classes: { label: string; count: number }[];
}

export type RosterSelector = { userIds: string[] } | { classLabel: string } | { codes: string[] };

export interface RosterAddResult {
  added: number;
  alreadyIn: number;
  notFound: string[];
  ineligible: { userId: string; reason: 'owner_cannot_sit' | 'locked' | 'not_candidate' }[];
  dryRun: boolean;
}

export type RosterSort = 'name' | 'code';

export const rosterQuery = (
  sessionId: string,
  params: { q?: string; page?: number; sort?: RosterSort },
) =>
  queryOptions({
    queryKey: ['sessions', 'roster', sessionId, params],
    queryFn: () =>
      apiFetch<PageResult<RosterItem>>(
        `/sessions/${sessionId}/roster${queryString({ ...params, pageSize: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });

export const rosterSearchQuery = (sessionId: string, q: string) =>
  queryOptions({
    queryKey: ['sessions', 'roster-search', sessionId, q],
    queryFn: () =>
      apiFetch<RosterSearchResult>(`/sessions/${sessionId}/roster/search${queryString({ q })}`),
    enabled: q.trim().length > 0,
  });

export const addToRoster = (sessionId: string, selector: RosterSelector, dryRun = false) =>
  apiFetch<RosterAddResult>(`/sessions/${sessionId}/roster`, {
    method: 'POST',
    body: { ...selector, dryRun },
  });
export const removeFromRoster = (sessionId: string, userIds: string[]) =>
  apiFetch<{ removed: number }>(`/sessions/${sessionId}/roster`, {
    method: 'DELETE',
    body: { userIds },
  });
export const setExtraMinutes = (sessionId: string, userId: string, extraMinutes: number) =>
  apiFetch<{ userId: string; extraMinutes: number }>(`/sessions/${sessionId}/roster/${userId}`, {
    method: 'PATCH',
    body: { extraMinutes },
  });
export const reissueRosterPassword = (sessionId: string, userId: string) =>
  apiFetch<{ temporaryPassword: string; passwordExpiresAt: string }>(
    `/sessions/${sessionId}/roster/${userId}/reissue-password`,
    { method: 'POST' },
  );
