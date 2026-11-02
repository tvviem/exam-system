import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function stopReasonOf(error: unknown): StopReason | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'NOT_FOUND';
  if (error.code !== 'INVALID_STATE') return null;
  if (error.details.reason === 'DEVICE_REVOKED') return 'DEVICE_REVOKED';
  if (error.details.reason === 'ATTEMPT_CLOSED') return 'ATTEMPT_CLOSED';
  return null;
}

/**
 * Lỗi do chính lô gửi đi (dữ liệu sai hình dạng): thử lại cũng vô ích, nên bỏ lô thay vì kẹt vòng lặp. Các lỗi 4xx khác
 * (401 hết phiên đăng nhập, 408, 429) có thể tự hết nên vẫn thử lại, không bao giờ âm thầm bỏ câu trả lời.
 */
const isBadRequest = (error: unknown) =>
  error instanceof ApiError && [400, 413, 422].includes(error.status);

export function useSaver(options: {
  attemptId: string;
  /** `clientSeq` server đã lưu của từng câu. */
  seqs: Record<string, number>;
  onServerTime: (time: { deadline: string; serverNow: string }) => void;
  onStop: (reason: StopReason) => void;
}) {
  const { attemptId } = options;
  const [initial] = useState(() => seedSeqs(emptyQueue(), options.seqs));
  const queue = useRef<QueueState>(initial);
  const [view, setView] = useState<QueueState>(initial);
  const mounted = useRef(true);
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
    if (sending.current || stopped.current || !mounted.current) return;
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
      } else if (mounted.current) {
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
      // Đang chờ thử lại sau lỗi thì giữ nhịp lùi 1, 2, 4… giây, không đặt lại về 300 ms.
      if (queue.current.failures === 0) {
        schedule(kind === 'text' ? TEXT_DELAY_MS : CHOICE_DELAY_MS);
      }
    },
    [schedule, commit],
  );

  /** Gửi ngay những gì còn chờ (rời ô tự luận, trước khi Nộp bài). `true` nếu hàng đợi đã trống. */
  const drain = useCallback(
    async (options: { retryNow?: boolean } = {}): Promise<boolean> => {
      // Rời ô tự luận (`retryNow: false`) không được phá nhịp thử lại khi đang mất mạng.
      if (options.retryNow === false && queue.current.failures > 0) return false;
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
    },
    [flush],
  );

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    mounted.current = true;
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      // Rời màn (chuyển trang trong ứng dụng): gửi nốt phần đang chờ rồi mới ngừng, kẻo mất thay đổi cuối.
      void flush();
      mounted.current = false;
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

  const unsaved = view.pending.length + view.inflight.length;
  return useMemo(
    () => ({ status, unsaved, rejected: view.rejected, change, drain }),
    [status, unsaved, view.rejected, change, drain],
  );
}
