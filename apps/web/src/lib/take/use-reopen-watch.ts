import { NUDGE_JITTER_MAX_MS, REALTIME_EVENT, REALTIME_JOIN } from '@exam/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { reopenWatchLeftMs } from '../force-confirm';
import { realtime } from '../realtime';
import { attemptQueryKey, fetchAttemptOnline } from '../take';
import { takeStore } from './idb-store';
import { rememberView } from './offline-attempt';

/** Hỏi lại trạng thái Lượt mỗi chừng này khi kênh đẩy không tới (đường chắc chắn, Q279). */
export const REOPEN_POLL_MS = 15_000;

/**
 * Màn "Đã nộp" của Lượt bị Buộc nộp (Q279): trong 15 phút kể từ lúc bị nộp, nếu Người ra đề Hoàn tác Buộc nộp thì tự về đề.
 * Tin đẩy `attempt.nudge` làm hỏi lại gần như tức thì; không có kênh đẩy thì hỏi lại mỗi 15 giây. Lượt được mở lại thì ghi
 * trạng thái mới vào bộ nhớ truy vấn nên trang chuyển sang màn làm bài; lỗi mạng thì thử lại ở nhịp sau, không báo lỗi.
 */
export function useReopenWatch(options: {
  attemptId: string;
  submittedAt: string | null;
  reason: string | null;
  /** Giờ server lúc nhận trạng thái "đã nộp", để tính thời gian còn theo dõi không phụ thuộc đồng hồ máy. */
  serverNow: string;
}) {
  const queryClient = useQueryClient();
  const { attemptId, submittedAt, reason, serverNow } = options;
  const mounted = useRef(performance.now());

  useEffect(() => {
    const left = () =>
      reopenWatchLeftMs(submittedAt, reason, serverNow, performance.now() - mounted.current);
    if (left() <= 0) return;
    let disposed = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      if (disposed || busy || left() <= 0) return;
      busy = true;
      try {
        const state = await fetchAttemptOnline(attemptId);
        if (disposed) return;
        if (state.status === 'in_progress') {
          // Giữ bản sao đề trên máy như lúc bắt đầu, để tải lại lúc mất mạng vẫn làm tiếp được (Q243).
          await rememberView(takeStore, state, Date.now()).catch(() => undefined);
          queryClient.setQueryData(attemptQueryKey(attemptId), state);
        }
      } catch {
        // Mất mạng hay lỗi thoáng qua: nhịp sau thử lại.
      } finally {
        busy = false;
      }
    };
    const schedule = () => {
      timer = setTimeout(async () => {
        await check();
        if (!disposed && left() > 0) schedule();
      }, REOPEN_POLL_MS);
    };
    schedule();

    const unsubscribe = realtime.subscribe({
      join: REALTIME_JOIN.attempt,
      payload: { attemptId },
      event: REALTIME_EVENT.attemptNudge,
      onEvent: () => {
        setTimeout(() => void check(), Math.random() * NUDGE_JITTER_MAX_MS);
      },
      // Vào lại phòng (nối lại sau khi đứt): có thể đã lỡ tin, hỏi bù.
      onConnected: () => void check(),
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [attemptId, submittedAt, reason, serverNow, queryClient]);
}
