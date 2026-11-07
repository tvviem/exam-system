import type { ReleaseBlocker, RichText } from '@exam/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';

// Chấm Câu tự luận, Kết quả, Mức xử lý và Ủy quyền chấm (docs/plan/slice-5.md, PR 5b).

export type Verdict = 'correct' | 'partial' | 'wrong' | 'blank' | 'pending';

export interface ResultRow {
  userId: string;
  code: string | null;
  fullName: string;
  classLabel: string | null;
  attemptCount: number;
  state: 'no_attempt' | 'hidden' | 'waiting_essay' | 'graded';
  pendingEssays: number | null;
  essayHidden: boolean;
  rawScore: number | null;
  maxScore: number;
  scaledScore: number | null;
  penaltyPercent: number;
  voided: boolean;
}

export interface ResultsData {
  session: {
    sessionId: string;
    title: string;
    opensAt: string;
    closesAt: string;
    durationMinutes: number;
    attemptScoring: 'highest' | 'latest';
    totalItems: number;
    maxScore: number;
  };
  role: 'owner' | 'delegate';
  blind: boolean;
  status: {
    submittedAttempts: number;
    pendingEssays: number;
    violationsUndecided: number;
    essayHidden: boolean;
  };
  release: {
    ready: boolean;
    blockers: ReleaseBlocker[];
    releasedAt: string | null;
    appealUntil: string | null;
    finalizedAt: string | null;
    reviewAfterRelease: boolean;
  };
  people: ResultRow[];
}

export interface PersonItem {
  itemId: string;
  no: number;
  /** Số Người dự thi thấy khi đề được xáo và khác số gốc; vắng khi đang che danh tính. */
  seenAs: number | null;
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  points: number;
  score: number | null;
  verdict: Verdict | 'hidden';
  source: 'auto' | 'manual' | 'appeal' | 'correction' | null;
  feedback: string | null;
}

export interface PersonDetail {
  person: { userId: string; code: string | null; fullName: string; classLabel: string | null };
  essayHidden: boolean;
  attempts: { attemptNo: number; submittedAt: string; items: PersonItem[] }[];
  violations: ViolationItem[];
}

export interface ViolationItem {
  id: string;
  userId?: string;
  action: 'warning' | 'disqualify';
  reason: string;
  recordedAt: string;
  penaltyType: 'none' | 'percent' | 'void';
  penaltyPercent: number | null;
  penaltyDecidedAt: string | null;
  fullName?: string | null;
  code?: string | null;
}

export interface ItemStat {
  itemId: string;
  no: number;
  type: PersonItem['type'];
  points: number;
  correct: number;
  partial: number;
  wrong: number;
  blank: number;
  pending: number;
  correctRate: number | null;
}

export interface EssayItem {
  itemId: string;
  no: number;
  points: number;
  stem: RichText;
  total: number;
  graded: number;
  pending: number;
}

export interface QueueEntry {
  attemptId: string;
  label: string;
  graded: boolean;
  score: number | null;
}

export interface QueueData {
  item: { itemId: string; no: number; points: number };
  blind: boolean;
  total: number;
  graded: number;
  pending: number;
  entries: QueueEntry[];
}

export interface EntryData {
  attemptId: string;
  label: string;
  blind: boolean;
  item: {
    itemId: string;
    no: number;
    points: number;
    stem: RichText;
    rubric: RichText | null;
    maxLength: number | null;
  };
  answer: string;
  score: number | null;
  feedback: string | null;
  graded: boolean;
  person?: { userId: string; code: string | null; fullName: string };
}

export type PenaltyInput =
  | { type: 'none' }
  | { type: 'percent'; percent: number }
  | { type: 'void' };

export interface DelegateInfo {
  delegate: {
    userId: string;
    fullName: string | null;
    code: string | null;
    grantedAt: string;
  } | null;
}

export interface Examiner {
  id: string;
  fullName: string;
  code: string | null;
}

const base = (sessionId: string) => `/sessions/${sessionId}`;

export const resultsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'results'],
    queryFn: () => apiFetch<ResultsData>(`${base(sessionId)}/results`),
    staleTime: 0,
  });

export const personQuery = (sessionId: string, userId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'person', userId],
    queryFn: () => apiFetch<PersonDetail>(`${base(sessionId)}/results/people/${userId}`),
    staleTime: 0,
  });

export const itemStatsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'item-stats'],
    queryFn: () =>
      apiFetch<{ attempts: number; items: ItemStat[] }>(`${base(sessionId)}/results/item-stats`),
    staleTime: 0,
  });

export const violationsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'violations'],
    queryFn: () => apiFetch<{ items: ViolationItem[] }>(`${base(sessionId)}/violations`),
    staleTime: 0,
  });

export const essayItemsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'items'],
    queryFn: () =>
      apiFetch<{ blind: boolean; items: EssayItem[] }>(`${base(sessionId)}/grading/items`),
    staleTime: 0,
  });

export const queueQuery = (sessionId: string, itemId: string, filter: 'pending' | 'all') =>
  queryOptions({
    queryKey: ['grading', sessionId, 'queue', itemId, filter],
    queryFn: () =>
      apiFetch<QueueData>(`${base(sessionId)}/grading/items/${itemId}/queue?filter=${filter}`),
    staleTime: 0,
  });

export const entryQuery = (sessionId: string, itemId: string, attemptId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'entry', itemId, attemptId],
    queryFn: () =>
      apiFetch<EntryData>(`${base(sessionId)}/grading/items/${itemId}/attempts/${attemptId}`),
    staleTime: 30_000,
  });

export const saveGrade = (
  sessionId: string,
  attemptId: string,
  itemId: string,
  body: { score: number | null; feedback?: string | null },
) =>
  apiFetch<{ score: number | null; verdict: Verdict; feedback: string | null }>(
    `${base(sessionId)}/grading/attempts/${attemptId}/items/${itemId}`,
    { method: 'PUT', body },
  );

export const setBlind = (sessionId: string, blind: boolean) =>
  apiFetch<{ blind: boolean }>(`${base(sessionId)}/grading/blind`, {
    method: 'PUT',
    body: { blind },
  });

export const setPenalty = (sessionId: string, violationId: string, penalty: PenaltyInput) =>
  apiFetch<ViolationItem>(`${base(sessionId)}/violations/${violationId}/penalty`, {
    method: 'PUT',
    body: penalty,
  });

const delegateBase = (sessionId: string, admin: boolean) =>
  admin ? `/admin/sessions/${sessionId}/grading-delegate` : `${base(sessionId)}/grading-delegate`;

export const delegateQuery = (sessionId: string, admin = false) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'delegate', admin],
    queryFn: () => apiFetch<DelegateInfo>(delegateBase(sessionId, admin)),
    staleTime: 0,
  });

export const delegateCandidatesQuery = (sessionId: string, q: string, admin = false) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'delegate-candidates', admin, q],
    queryFn: () =>
      apiFetch<{ items: Examiner[] }>(
        `${delegateBase(sessionId, admin)}/candidates?q=${encodeURIComponent(q)}`,
      ),
    staleTime: 10_000,
  });

export const grantDelegate = (sessionId: string, userId: string, admin = false) =>
  apiFetch<DelegateInfo>(delegateBase(sessionId, admin), { method: 'PUT', body: { userId } });

export const revokeDelegate = (sessionId: string, admin = false) =>
  apiFetch<DelegateInfo>(delegateBase(sessionId, admin), { method: 'DELETE' });

export interface DelegatedSession {
  sessionId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  ownerName: string | null;
}

export const delegatedSessionsQuery = queryOptions({
  queryKey: ['grading', 'delegated-sessions'],
  queryFn: () => apiFetch<{ items: DelegatedSession[] }>('/grading/delegated-sessions'),
});

export interface AdminSession {
  sessionId: string;
  title: string;
  opensAt: string;
  cancelledAt: string | null;
  ownerName: string | null;
}

export const adminSessionsQuery = (q: string) =>
  queryOptions({
    queryKey: ['grading', 'admin-sessions', q],
    queryFn: () =>
      apiFetch<{ items: AdminSession[] }>(`/admin/sessions?q=${encodeURIComponent(q)}`),
    staleTime: 10_000,
  });

export const releaseSession = (sessionId: string, appealPeriodDays: number) =>
  apiFetch<{ releasedAt: string; appealUntil: string | null; finalizedAt: string | null }>(
    `${base(sessionId)}/release`,
    { method: 'POST', body: { appealPeriodDays } },
  );

export const setReviewAfterRelease = (sessionId: string, reviewAfterRelease: boolean) =>
  apiFetch<{ reviewAfterRelease: boolean }>(`${base(sessionId)}/grading/review`, {
    method: 'PUT',
    body: { reviewAfterRelease },
  });

/** Kết quả của chính Người dự thi sau Công bố (Q297). */
export interface MyResultItem {
  no: number;
  type: PersonItem['type'];
  points: number;
  score: number | null;
  verdict: Exclude<Verdict, 'pending'>;
  cluster?: { correct: number; total: number };
  essay?: { answer: string; feedback: string | null };
  review?: { stem: RichText; payload: Record<string, unknown>; answer: unknown };
}

export interface MyResult {
  session: { sessionId: string; title: string; opensAt: string; durationMinutes: number };
  releasedAt: string;
  appealUntil: string | null;
  finalizedAt: string | null;
  reviewAfterRelease: boolean;
  attemptCount: number;
  countedAttemptNo: number | null;
  summary: {
    rawScore: number;
    maxScore: number;
    finalScore: number;
    scaledScore: number;
    percent: number;
    penaltyPercent: number;
    voided: boolean;
  };
  penalties: {
    action: 'warning' | 'disqualify';
    reason: string;
    type: 'percent' | 'void';
    percent: number | null;
  }[];
  items: MyResultItem[];
}

export const myResultQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['take', 'result', sessionId],
    queryFn: () => apiFetch<MyResult>(`/take/sessions/${sessionId}/result`),
  });
