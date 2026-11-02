import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { saveResponses } from '../take';
import {
  ack,
  type Change,
  emptyQueue,
  enqueue,
  fail,
  nextBatch,
  type QueueState,
  retryDelayMs,
  type SaveStatus,
  saveStatusOf,
  seedSeqs,
} from './save-queue';

// Chạy hàng đợi lưu bài (Q241): gộp thao tác, gửi từng lô, thử lại khi lỗi mạng, dừng khi server báo Lượt không còn nhận.

/** Lý do dừng hẳn: thiết bị bị thu hồi, Lượt đã đóng hoặc không còn tồn tại. */
export type StopReason = 'DEVICE_REVOKED' | 'ATTEMPT_CLOSED' | 'NOT_FOUND';

const CHOICE_DELAY_MS = 300;
const TEXT_DELAY_MS = 800;

function stopReasonOf(error: unknown): StopReason | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'NOT_FOUND';
  if (error.code !== 'INVALID_STATE') return null;
  if (error.details.reason === 'DEVICE_REVOKED') return 'DEVICE_REVOKED';
  if (error.details.reason === 'ATTEMPT_CLOSED') return 'ATTEMPT_CLOSED';
  return null;
}

/** Lỗi do chính lô gửi đi (400): thử lại cũng vô ích, nên bỏ lô thay vì kẹt vòng lặp. */
const isBadRequest = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429;

export function useSaver(options: {
  attemptId: string;
  /** `clientSeq` server đã lưu của từng câu. */
  seqs: Record<string, number>;
  onServerTime: (time: { deadline: string; serverNow: string }) => void;
  onStop: (reason: StopReason) => void;
}) {
  const { attemptId } = options;
  const queue = useRef<QueueState>(seedSeqs(emptyQueue(), options.seqs));
  const [view, setView] = useState<QueueState>(queue.current);
  const [online, setOnline] = useState(() => navigator.onLine);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false);
  const stopped = useRef(false);
  const callbacks = useRef(options);
  callbacks.current = options;

  const commit = useCallback((next: QueueState) => {
    queue.current = next;
    setView(next);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (sending.current || stopped.current) return;
    const { batch, queue: inflight } = nextBatch(queue.current);
    if (batch.length === 0) return;
    commit(inflight);
    sending.current = true;
    try {
      const response = await saveResponses(attemptId, batch);
      commit(ack(queue.current, response.results));
      callbacks.current.onServerTime(response);
    } catch (error) {
      const reason = stopReasonOf(error);
      if (reason) {
        stopped.current = true;
        callbacks.current.onStop(reason);
      } else if (isBadRequest(error)) {
        commit(
          ack(
            queue.current,
            batch.map((item) => ({
              itemId: item.itemId,
              status: 'rejected' as const,
              reason: 'bad_request',
            })),
          ),
        );
      } else {
        commit(fail(queue.current));
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), retryDelayMs(queue.current.failures));
      }
    } finally {
      sending.current = false;
    }
    if (!stopped.current && queue.current.failures === 0) await flush();
  }, [attemptId, commit]);

  const schedule = useCallback(
    (delay: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  /** Ghi nhận một thay đổi của Người dự thi; `text` bật độ trễ dài hơn cho ô tự luận đang gõ. */
  const change = useCallback(
    (item: Change, kind: 'choice' | 'text' = 'choice') => {
      if (stopped.current) return;
      commit(enqueue(queue.current, item));
      schedule(kind === 'text' ? TEXT_DELAY_MS : CHOICE_DELAY_MS);
    },
    [schedule, commit],
  );

  /** Gửi ngay những gì còn chờ (rời ô tự luận, trước khi Nộp bài). `true` nếu hàng đợi đã trống. */
  const drain = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    while (
      !stopped.current &&
      (queue.current.pending.length > 0 || queue.current.inflight.length > 0)
    ) {
      if (sending.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      await flush();
      if (queue.current.failures > 0) return false;
    }
    return queue.current.pending.length === 0 && queue.current.inflight.length === 0;
  }, [flush]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const status: SaveStatus = saveStatusOf(view, online);

  // Còn việc chưa lưu thì trình duyệt hỏi lại trước khi đóng tab (4c-2 sẽ giữ hàng đợi qua IndexedDB).
  useEffect(() => {
    if (status === 'saved') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  return {
    status,
    unsaved: view.pending.length + view.inflight.length,
    rejected: view.rejected,
    change,
    drain,
  };
}
