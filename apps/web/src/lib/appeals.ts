import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { PenaltyInput, Verdict } from './grading';

// Phúc khảo (docs/plan/slice-5.md, PR 5d; Q300–Q317): Người dự thi gửi, Người ra đề xử lý và gia hạn.

export type AppealStatus = 'open' | 'resolved';
export type AppealTarget = 'response' | 'penalty';

/** Một Phúc khảo như Người dự thi thấy. */
export interface MyAppeal {
  id: string;
  target: AppealTarget;
  /** Số "Câu N" Người dự thi đã thấy (chỉ Phúc khảo về câu). */
  no: number | null;
  violationId: string | null;
  reason: string;
  status: AppealStatus;
  createdAt: string;
  response: string | null;
  previousValue: AppealValue | null;
  newValue: AppealValue | null;
  resolvedAt: string | null;
}

/** Điểm hoặc Mức xử lý trước và sau khi xử lý. */
export type AppealValue = { score?: number | null; verdict?: Verdict } & {
  type?: 'none' | 'percent' | 'void';
  percent?: number | null;
};

export interface MyAppeals {
  limit: number;
  used: number;
  appealUntil: string | null;
  finalizedAt: string | null;
  appeals: MyAppeal[];
}

export const myAppealsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['take', 'appeals', sessionId],
    queryFn: () => apiFetch<MyAppeals>(`/take/sessions/${sessionId}/appeals`),
  });

export type CreateAppealInput =
  | { target: 'response'; no: number; reason: string }
  | { target: 'penalty'; violationId: string; reason: string };

export const createAppeal = (sessionId: string, input: CreateAppealInput) =>
  apiFetch<{ appeal: MyAppeal; limit: number; used: number }>(
    `/take/sessions/${sessionId}/appeals`,
    { method: 'POST', body: input },
  );

/** Một dòng trong danh sách Phúc khảo của Người ra đề. */
export interface AppealRow {
  id: string;
  status: AppealStatus;
  target: AppealTarget;
  createdAt: string;
  resolvedAt: string | null;
  user: { id: string; code: string | null; fullName: string };
  /** Số câu theo thứ tự đề của Người ra đề, và số Người dự thi đã thấy (ghi chú đối chiếu). */
  no: number | null;
  seenAs: number | null;
  reason: string;
}

export interface AppealList {
  open: number;
  resolved: number;
  items: AppealRow[];
}

export const appealsQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'appeals'],
    queryFn: () => apiFetch<AppealList>(`/sessions/${sessionId}/appeals`),
    staleTime: 0,
  });

export interface AppealDetail {
  id: string;
  status: AppealStatus;
  target: AppealTarget;
  reason: string;
  createdAt: string;
  user: { id: string; code: string | null; fullName: string };
  response: string | null;
  previousValue: AppealValue | null;
  newValue: AppealValue | null;
  resolvedAt: string | null;
  /** Phúc khảo về câu. */
  item?: {
    no: number;
    seenAs: number | null;
    type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
    points: number;
    stem: unknown;
    payload: Record<string, unknown>;
  };
  examId?: string;
  itemId?: string;
  /** Chỉ chủ Bộ đề Đính chính được; người được Ủy quyền chỉ thấy gợi ý báo chủ Bộ đề. */
  canCorrect?: boolean;
  /** Đính chính đã đổi điểm tự động của Lượt này ở câu này. */
  correction?: { correctedAt: string; oldScore: number | null; newScore: number | null } | null;
  answer?: unknown;
  grade?: {
    score: number | null;
    verdict: Verdict;
    source: 'auto' | 'manual' | 'appeal' | 'correction';
    feedback: string | null;
  } | null;
  /** Phúc khảo về Mức xử lý. */
  violation?: {
    id: string;
    action: 'warning' | 'disqualify';
    reason: string;
    recordedAt: string;
    penaltyType: 'none' | 'percent' | 'void';
    penaltyPercent: number | null;
  };
}

export const appealDetailQuery = (sessionId: string, appealId: string) =>
  queryOptions({
    queryKey: ['grading', sessionId, 'appeal', appealId],
    queryFn: () => apiFetch<AppealDetail>(`/sessions/${sessionId}/appeals/${appealId}`),
    staleTime: 0,
  });

export type ResolveAppealInput =
  | { response: string; score: number }
  | { response: string; penalty: PenaltyInput };

export const resolveAppeal = (sessionId: string, appealId: string, input: ResolveAppealInput) =>
  apiFetch<{
    id: string;
    status: AppealStatus;
    response: string | null;
    previousValue: AppealValue | null;
    newValue: AppealValue | null;
    resolvedAt: string | null;
  }>(`/sessions/${sessionId}/appeals/${appealId}/resolve`, { method: 'POST', body: input });

export const extendAppealPeriod = (sessionId: string, appealPeriodDays: number) =>
  apiFetch<{ appealUntil: string | null }>(`/sessions/${sessionId}/appeal-period/extend`, {
    method: 'POST',
    body: { appealPeriodDays },
  });

/** Còn bao lâu đến hạn, viết gọn ("41 giờ", "2 ngày 3 giờ", "25 phút"); `null` khi đã hết hạn. */
export function remainingText(
  untilIso: string,
  nowMs: number,
  unit: { day: string; hour: string; minute: string },
): string | null {
  const ms = new Date(untilIso).getTime() - nowMs;
  if (ms <= 0) return null;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} ${unit.minute}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${unit.hour}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days} ${unit.day} ${rest} ${unit.hour}` : `${days} ${unit.day}`;
}
