import type { RichText } from '@exam/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { SessionRow } from './take/entry';
import type { ItemResult, SaveItem } from './take/save-queue';

// Khu làm bài của Người dự thi (docs/plan/slice-4.md, Q229–Q233, Q237–Q247).

export interface TakeSession extends SessionRow {
  sessionId: string;
  title: string;
  examTitle: string;
  questionCount: number;
  opensAt: string;
  closesAt: string;
  /** Đã gồm giờ cộng sẵn. */
  durationMinutes: number;
}

export const takeSessionsQuery = queryOptions({
  queryKey: ['take', 'sessions'],
  queryFn: () => apiFetch<{ items: TakeSession[] }>('/take/sessions'),
});

export const joinSession = (code: string) =>
  apiFetch<{ sessionId: string; attemptId: string | null }>('/take/join', {
    method: 'POST',
    body: { code },
  });

export type TakeItemType = 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';

export interface TakeOption {
  id: string;
  content: RichText;
}

export interface TakeItem {
  itemId: string;
  no: number;
  points: number;
  type: TakeItemType;
  stem: RichText;
  /** Không bao giờ có Đáp án đúng (bất biến của hệ thống). */
  payload: {
    options?: TakeOption[];
    statements?: TakeOption[];
    maxLength?: number;
  };
  response: { value: unknown; flagged: boolean; clientSeq: number } | null;
}

export interface TakeSection {
  id: string;
  title: string | null;
  instructions: RichText | null;
  items: TakeItem[];
}

export interface AttemptView {
  status: 'in_progress';
  attempt: {
    id: string;
    attemptNo: number;
    maxAttempts: number;
    startedAt: string;
    deadline: string;
    serverNow: string;
  };
  session: { id: string; title: string };
  exam: { title: string; instructions: RichText | null };
  /** Gốc đường dẫn ảnh của Lượt này: `<mediaBase>/<illustrationId>/<cỡ>`. */
  mediaBase: string;
  sections: TakeSection[];
}

export interface SubmittedState {
  status: 'submitted';
  attempt: { id: string; attemptNo: number; submittedAt: string; serverNow: string };
}

export type AttemptState = AttemptView | SubmittedState;

export const attemptQueryKey = (id: string) => ['take', 'attempt', id] as const;

/** Nội dung đề chỉ tải một lần cho mỗi lần mở trang; Câu trả lời sau đó nằm ở trạng thái cục bộ của màn làm bài. */
export const attemptQuery = (id: string) =>
  queryOptions({
    queryKey: attemptQueryKey(id),
    queryFn: () => apiFetch<AttemptState>(`/take/attempts/${id}`),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

export const startAttempt = (sessionId: string) =>
  apiFetch<AttemptState>(`/take/sessions/${sessionId}/start`, { method: 'POST' });

export interface SaveResponse {
  status: 'in_progress';
  deadline: string;
  serverNow: string;
  results: ItemResult[];
}

export const saveResponses = (attemptId: string, items: SaveItem[]) =>
  apiFetch<SaveResponse>(`/take/attempts/${attemptId}/responses`, {
    method: 'PUT',
    body: { items },
  });

export const submitAttempt = (attemptId: string) =>
  apiFetch<SubmittedState>(`/take/attempts/${attemptId}/submit`, { method: 'POST' });

/** Văn bản thuần của một đoạn nội dung, để làm tên cho nút (trình đọc màn hình). */
export function plainTextOf(doc: RichText): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    const n = node as {
      type?: string;
      text?: string;
      content?: unknown[];
      attrs?: { latex?: string };
    };
    if (n.type === 'text' && n.text) parts.push(n.text);
    if (n.type === 'math' && n.attrs?.latex) parts.push(n.attrs.latex);
    n.content?.forEach(walk);
  };
  walk(doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
