import type { RichText } from '@exam/shared';
import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiFetch } from './api';
import type { SessionRow } from './take/entry';
import type { HeartbeatBody, HeartbeatReply } from './take/heartbeat-queue';
import { takeStore } from './take/idb-store';
import { forgetAttemptLocally } from './take/local-data';
import { loadAttempt, rememberView } from './take/offline-attempt';
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
  /** Chỉ có khi đọc từ bản sao trên máy lúc mất kết nối (Q243). */
  offline?: boolean;
  /** Thay đổi còn giữ trên máy mà server chưa nhận (Q243); màn làm bài đưa lại vào hàng đợi lưu. */
  unsent?: SaveItem[];
}

/** Phần nội dung màn làm bài cần để dựng đề, chung cho Lượt thật và Xem thử. */
export type TakeContent = Pick<AttemptView, 'exam' | 'sections' | 'mediaBase'>;

/** Xem thử qua Phiên thi (Q220, Q245): nội dung như Người dự thi thấy, không có Lượt, hạn giờ hay Câu trả lời. */
export interface PreviewView extends TakeContent {
  status: 'preview';
  session: { id: string; title: string };
  durationMinutes: number;
}

/** Không lưu đệm lâu: mỗi lần mở là một lần trộn mới, và đổi tab không được làm đề đổi chỗ giữa chừng. */
export const previewQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['preview', sessionId],
    queryFn: () => apiFetch<PreviewView>(`/sessions/${sessionId}/try`),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false, // 404 (không phải chủ) hay lỗi khác: báo ngay, không thử lại vài giây
  });

export type SubmitReason =
  | 'candidate'
  | 'timeout'
  | 'examiner'
  | 'disqualified'
  | 'account_locked'
  | 'session_cancelled';

export interface SubmittedState {
  status: 'submitted';
  attempt: {
    id: string;
    attemptNo: number;
    submittedAt: string;
    submitReason: SubmitReason | null;
    serverNow: string;
  };
  /** Chỉ phía trình duyệt: số câu trả lời chưa kịp gửi khi Lượt đóng (server không nhận), để báo cho Người dự thi. */
  lostAnswers?: number;
}

export type AttemptState = AttemptView | SubmittedState;

/** Nộp bài khi còn câu trả lời chưa lưu được lên hệ thống (mất kết nối): không nộp, để Người dự thi kết nối lại. */
export class UnsavedError extends Error {}

export const attemptQueryKey = (id: string) => ['take', 'attempt', id] as const;

/** Nội dung đề chỉ tải một lần cho mỗi lần mở trang (mất mạng thì mở bản sao trên máy, Q243); Câu trả lời sau đó nằm ở trạng thái cục bộ của màn làm bài. */
export const attemptQuery = (id: string) =>
  queryOptions({
    queryKey: attemptQueryKey(id),
    queryFn: async () => {
      try {
        const state = await loadAttempt(id, {
          fetchAttempt: () => apiFetch<AttemptState>(`/take/attempts/${id}`),
          store: takeStore,
          now: Date.now,
        });
        // Đã nộp hoặc đóng ở server: ảnh lưu đệm cũng không còn cần (hàng đợi và bản sao đề do loadAttempt xóa).
        if (state.status === 'submitted') void forgetAttemptLocally(id);
        return state;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) void forgetAttemptLocally(id);
        throw error;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

/** Hỏi thẳng server, không rơi về bản sao trên máy: dùng khi cần biết Lượt đã đóng hay chưa. */
export async function fetchAttemptOnline(id: string): Promise<AttemptState> {
  const state = await apiFetch<AttemptState>(`/take/attempts/${id}`);
  if (state.status === 'submitted') void forgetAttemptLocally(id);
  return state;
}

export async function startAttempt(sessionId: string): Promise<AttemptState> {
  const state = await apiFetch<AttemptState>(`/take/sessions/${sessionId}/start`, {
    method: 'POST',
  });
  // Giữ bản sao đề ngay từ lúc bắt đầu (màn làm bài nhận đề từ đây, không qua `loadAttempt`).
  if (state.status === 'in_progress') {
    await rememberView(takeStore, state, Date.now()).catch(() => undefined);
  }
  return state;
}

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

/** Nhịp báo còn làm bài (Q213): trả hạn hiện tại, thiết bị còn hợp lệ không và thông báo mới. */
export const sendHeartbeat = (attemptId: string, body: HeartbeatBody) =>
  apiFetch<HeartbeatReply>(`/take/attempts/${attemptId}/heartbeat`, { method: 'POST', body });

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
