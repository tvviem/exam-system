import type { RichText } from '@exam/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';

// Đính chính đáp án (docs/plan/slice-5.md, PR 5d-3; Q302, Q316–Q321): chủ Bộ đề đổi Đáp án đúng của một câu, chấm lại ở nền.

/** Dạng đáp án của `@exam/scoring`: id Phương án đúng, hoặc giá trị Đúng/Sai của từng Mệnh đề (chùm). */
export type Key = string[] | Record<string, boolean>;

export type KeyItemType = 'single_choice' | 'multiple_choice' | 'true_false_cluster';

/** Một câu có đáp án của Bộ đề (nội dung kèm đáp án hiệu lực; chỉ chủ Bộ đề lấy được). */
export interface KeyItem {
  itemId: string;
  no: number;
  type: KeyItemType;
  points: number;
  stem: RichText;
  payload: {
    options?: { id: string; content: RichText }[];
    statements?: { id: string; content: RichText; key: boolean }[];
    key?: string[];
  };
  questionId: string;
  /** Số lần đã đính chính câu này. */
  corrections: number;
}

export const keyItemsQuery = (examId: string) =>
  queryOptions({
    queryKey: ['grading', 'exam', examId, 'key-items'],
    queryFn: () => apiFetch<{ items: KeyItem[] }>(`/exams/${examId}/key-correction-items`),
    staleTime: 0,
  });

/** Đáp án hiện có của câu (đã tính bản đính chính). */
export function currentKeyOf(item: KeyItem): Key {
  if (item.type === 'true_false_cluster') {
    return Object.fromEntries((item.payload.statements ?? []).map((s) => [s.id, s.key]));
  }
  return [...(item.payload.key ?? [])];
}

export function sameKey(a: Key, b: Key): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const x = [...a].sort();
    const y = [...b].sort();
    return x.length === y.length && x.every((id, i) => id === y[i]);
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((id) => a[id] === b[id]);
}

/** Đáp án mới dùng được cho câu này (chọn một đúng một Phương án; chọn nhiều ít nhất một). */
export function keyUsable(item: KeyItem, key: Key): boolean {
  if (item.type === 'true_false_cluster') return !Array.isArray(key);
  if (!Array.isArray(key)) return false;
  return item.type === 'single_choice' ? key.length === 1 : key.length >= 1;
}

export interface KeyImpact {
  attempts: number;
  increase: number;
  decrease: number;
  unchanged: number;
  openSessions: number;
  finalizedSessions: number;
  openAppeals: number;
}

export const previewKeyCorrection = (examId: string, itemId: string, newKey: Key) =>
  apiFetch<KeyImpact>(`/exams/${examId}/items/${itemId}/key-correction/preview`, {
    method: 'POST',
    body: { newKey },
  });

export const createKeyCorrection = (examId: string, itemId: string, newKey: Key, reason: string) =>
  apiFetch<{ id: string; status: 'running' | 'done' | 'failed' }>(
    `/exams/${examId}/items/${itemId}/key-correction`,
    { method: 'POST', body: { newKey, reason } },
  );

export interface KeyCorrectionProgress {
  id: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  increase: number;
  decrease: number;
}

/** Tiến độ chấm lại: hỏi lại ngắn nhịp cho tới khi xong hoặc lỗi. */
export const keyCorrectionProgressQuery = (examId: string, id: string) =>
  queryOptions({
    queryKey: ['grading', 'exam', examId, 'key-correction', id],
    queryFn: () => apiFetch<KeyCorrectionProgress>(`/exams/${examId}/key-corrections/${id}`),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 600 : false),
  });

export const retryKeyCorrection = (examId: string, id: string) =>
  apiFetch<{ id: string }>(`/exams/${examId}/key-corrections/${id}/retry`, { method: 'POST' });
