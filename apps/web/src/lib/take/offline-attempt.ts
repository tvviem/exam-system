import { ApiError } from '../api';
import type { AttemptState, AttemptView } from '../take';
import { knownAnswers, type QueueState, type SaveItem, unsentOf } from './save-queue';

// Đọc Lượt làm bài sao cho tải lại trang lúc mất mạng vẫn làm tiếp được (Q243). IndexedDB nằm sau `QueueStore` để
// kiểm thử bằng kho giả; bản thật ở `idb-store.ts`.

/** Bản sao `view` lần cuối lấy được từ server, kèm giờ máy (`Date.now()`) lúc nhận để bù giờ khi đọc lại. */
export interface StoredView {
  view: AttemptView;
  savedAt: number;
}

/**
 * `answers`: câu trả lời mới nhất của từng câu (kể cả đã gửi xong), để mở lại đề lúc mất mạng thấy đủ.
 * `items`: phần server chưa xác nhận, gửi lại khi có mạng.
 */
export interface StoredQueue {
  answers: SaveItem[];
  items: SaveItem[];
}

export interface QueueStore {
  load(attemptId: string): Promise<{ view?: StoredView; queue?: StoredQueue }>;
  saveView(attemptId: string, value: StoredView): Promise<void>;
  saveQueue(attemptId: string, value: StoredQueue): Promise<void>;
  /** Lượt đã nộp hoặc đóng: xóa mọi thứ của Lượt này. */
  forget(attemptId: string): Promise<void>;
  /** Đăng xuất: bỏ mọi bản sao đề; `keepUnsent` giữ lại hàng đợi còn câu chưa gửi để đăng nhập lại gửi nốt. */
  forgetAll(keepUnsent: boolean): Promise<void>;
}

/** Không tới được server: mất mạng (fetch ném lỗi) hoặc cổng web báo 502/503/504. */
export const isUnreachable = (error: unknown) =>
  !(error instanceof ApiError) || [502, 503, 504].includes(error.status);

/** Ghi trạng thái hàng đợi xuống máy sau mỗi thay đổi; chỉ phần chưa được server xác nhận mới cần giữ. */
export const persistQueue = (store: QueueStore, attemptId: string, queue: QueueState) =>
  store.saveQueue(attemptId, { answers: knownAnswers(queue), items: unsentOf(queue) });

/** Phủ câu trả lời còn giữ trên máy lên đề; chỗ server đã có bản mới hơn hoặc bằng (theo `clientSeq`) thì bỏ. */
function withLocalAnswers(view: AttemptView, queue: StoredQueue | undefined): AttemptView {
  const serverSeq = new Map(
    view.sections.flatMap((section) =>
      section.items.map((item) => [item.itemId, item.response?.clientSeq ?? 0] as const),
    ),
  );
  const newer = (item: SaveItem) => item.clientSeq > (serverSeq.get(item.itemId) ?? 0);
  const answers = new Map((queue?.answers ?? []).filter(newer).map((a) => [a.itemId, a]));
  const sections = view.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const local = answers.get(item.itemId);
      if (!local) return item;
      return {
        ...item,
        response: {
          value: local.value !== undefined ? local.value : (item.response?.value ?? null),
          flagged: local.flagged !== undefined ? local.flagged : (item.response?.flagged ?? false),
          clientSeq: local.clientSeq,
        },
      };
    }),
  }));
  return { ...view, sections, unsent: (queue?.items ?? []).filter(newer) };
}

/** Giữ bản sao đề trên máy, kèm giờ máy lúc nhận để bù giờ khi đọc lại. */
export const rememberView = (store: QueueStore, view: AttemptView, now: number) =>
  store.saveView(view.attempt.id, { view, savedAt: now });

export async function loadAttempt(
  attemptId: string,
  deps: { fetchAttempt: () => Promise<AttemptState>; store: QueueStore; now: () => number },
): Promise<AttemptState> {
  const { store, now } = deps;
  try {
    const state = await deps.fetchAttempt();
    if (state.status === 'submitted') {
      await store.forget(attemptId);
      return state;
    }
    await rememberView(store, state, now());
    return withLocalAnswers(state, (await store.load(attemptId)).queue);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) await store.forget(attemptId);
    if (!isUnreachable(error)) throw error;
    const { view: stored, queue } = await store.load(attemptId);
    if (!stored) throw error;
    const elapsed = Math.max(0, now() - stored.savedAt);
    const serverNow = new Date(Date.parse(stored.view.attempt.serverNow) + elapsed).toISOString();
    return {
      ...withLocalAnswers(stored.view, queue),
      attempt: { ...stored.view.attempt, serverNow },
      offline: true,
    };
  }
}
