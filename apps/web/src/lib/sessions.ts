import type { RichText, SessionPhase } from '@exam/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { PageResult } from './admin';
import { apiFetch } from './api';
import { queryString } from './query-string';
import type { VariantLoad } from './session-variants';

// Phiên thi và Danh sách dự thi (docs/plan/slice-4.md, Q192–Q222).

export { SESSION_PHASES } from '@exam/shared';
export type { SessionPhase };

/** Cấu hình rút câu của một Phần ở Phiên thi (Q438): mặc định của Bộ đề, ghi đè, tỷ lệ hiệu lực và số câu mỗi người nhận. */
export interface SessionDrawRow {
  sectionId: string;
  title: string | null;
  itemCount: number;
  defaultPercent: number;
  overridePercent: number | null;
  percent: number;
  drawCount: number;
}

/** Một Mã đề của Phiên thi dùng chung Mã đề (docs/plan/ma-de-phien-thi-thiet-ke.md). */
export interface SessionVariant {
  id: string;
  number: number;
  label: string;
  itemCount: number;
}

/** Bộ câu của một Mã đề cho chủ Phiên thi (tab Đề): câu theo Phần, không có phương án hay đáp án. */
export interface SessionVariantView {
  id: string;
  number: number;
  label: string;
  itemCount: number;
  totalPoints: number;
  sections: {
    sectionId: string;
    title: string | null;
    items: { itemId: string; type: string; points: number; stem: RichText }[];
  }[];
}

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
  /** Chỉ có ở chi tiết Phiên thi. */
  sectionDraws?: SessionDrawRow[];
  /** Đã có Lượt làm bài: không đổi được tỷ lệ rút nữa. Chỉ có ở chi tiết. */
  drawLocked?: boolean;
  /** Cách ra đề: dùng chung các Mã đề hay mỗi người một đề. Chỉ có ở chi tiết; thiếu là mỗi người một đề. */
  drawScope?: 'shared' | 'per_candidate';
  variants?: SessionVariant[];
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
  /** Ghi đè tỷ lệ rút theo Phần; vắng là giữ nguyên khi sửa, mảng rỗng là xóa hết ghi đè. */
  sectionDraws?: { sectionId: string; percent: number }[];
  /** Cách ra đề; không nêu khi sửa là giữ nguyên. */
  drawScope?: 'shared' | 'per_candidate';
  /** Số Mã đề (1 đến 10), chỉ khi dùng chung Mã đề. */
  variantCount?: number;
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

/** Bộ câu của từng Mã đề (tab Đề); Phiên thi mỗi người một đề thì rỗng. */
export const sessionVariantsQuery = (id: string) =>
  queryOptions({
    queryKey: ['sessions', 'variants', id],
    queryFn: () => apiFetch<{ variants: SessionVariantView[] }>(`/sessions/${id}/variants`),
  });
/** Rút lại bộ câu của một Mã đề (`number`) hoặc của tất cả. */
export const redrawVariants = (id: string, number?: number) =>
  apiFetch<SessionSummary>(`/sessions/${id}/variants/redraw`, {
    method: 'POST',
    body: number === undefined ? {} : { number },
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
  /** Số Lượt làm bài của người này; đã có Lượt thì không đổi Mã đề được. */
  attemptCount: number;
  /** Mã đề được gán (Phiên thi dùng chung Mã đề); `null` khi mỗi người một đề. */
  variant: { number: number; label: string } | null;
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
      apiFetch<PageResult<RosterItem> & { variants: VariantLoad[] }>(
        `/sessions/${sessionId}/roster${queryString({ ...params, pageSize: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });

/** Đổi tay Mã đề của một người (chưa có Lượt). */
export const setRosterVariant = (sessionId: string, userId: string, number: number) =>
  apiFetch<{ userId: string; variant: { number: number; label: string } }>(
    `/sessions/${sessionId}/roster/${userId}/variant`,
    { method: 'PUT', body: { number } },
  );
/** Chia lại cả Danh sách vào các Mã đề (chỉ khi chưa ai làm bài). */
export const rebalanceVariants = (sessionId: string) =>
  apiFetch<{ variants: VariantLoad[] }>(`/sessions/${sessionId}/variants/rebalance`, {
    method: 'POST',
    body: {},
  });

export const rosterSearchQuery = (sessionId: string, q: string) =>
  queryOptions({
    queryKey: ['sessions', 'roster-search', sessionId, q],
    queryFn: ({ signal }) =>
      apiFetch<RosterSearchResult>(`/sessions/${sessionId}/roster/search${queryString({ q })}`, {
        signal,
      }),
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
