import { NUDGE_JITTER_MAX_MS, REALTIME_EVENT, REALTIME_JOIN } from '@exam/shared';
import { useEffect, useRef } from 'react';
import { realtime } from '../realtime';
import { sendHeartbeat } from '../take';
import { newId } from '../uuid';
import {
  ackBeat,
  emptyBeats,
  type HeartbeatEventType,
  type HeartbeatState,
  type Notice,
  nextBeat,
  recordEvent,
} from './heartbeat-queue';
import { type StopReason, stopReasonOf } from './use-saver';

// Nhịp báo còn làm bài mỗi 15 giây (Q213): giúp Người ra đề thấy ai còn kết nối, và là đường chắc chắn để Cộng giờ,
// Cảnh cáo, Buộc nộp và Thu hồi thiết bị đến Người dự thi trong tối đa một nhịp, kể cả khi kênh đẩy hỏng.

export const HEARTBEAT_INTERVAL_MS = 15_000;

// Mốc `since` giữ theo từng Lượt trong sessionStorage: tải lại trang vẫn nhận Cảnh cáo và Cộng giờ phát sinh lúc trang đóng.
const cursorKey = (attemptId: string) => `exam:hb-cursor:${attemptId}`;
const storedCursor = (attemptId: string): string | null => {
  try {
    return sessionStorage.getItem(cursorKey(attemptId));
  } catch {
    return null;
  }
};
const storeCursor = (attemptId: string, cursor: string) => {
  try {
    sessionStorage.setItem(cursorKey(attemptId), cursor);
  } catch {
    // Không lưu được thì lần tải lại sau chỉ mất mốc, không mất gì khác.
  }
};

export function useHeartbeat(options: {
  attemptId: string;
  /** Mốc đầu tiên để nhận thông báo: lần mở Lượt đầu là giờ bắt đầu; tải lại trang thì mốc đã lưu của lần trước. */
  since: string;
  /** Tắt khi màn làm bài đã dừng (thiết bị bị thu hồi, Lượt đã đóng): không gửi thêm nhịp thừa. */
  active: boolean;
  onServerTime: (time: { deadline: string; serverNow: string }) => void;
  onStop: (reason: StopReason) => void;
  onNotices: (notices: Notice[]) => void;
}) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const { attemptId, active } = options;

  useEffect(() => {
    if (!active) return;
    let state: HeartbeatState = emptyBeats(storedCursor(attemptId) ?? callbacks.current.since);
    let stopped = false;
    let disposed = false;
    let sending = false;
    // Tin đẩy (hay sự kiện) đến lúc một nhịp đang bay: nhịp đó có thể đã đọc dữ liệu trước thay đổi, nên gửi lại ngay sau đó.
    let again = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      if (stopped) return;
      if (sending) {
        again = true;
        return;
      }
      sending = true;
      again = false;
      clearTimeout(timer);
      const { body, sentIds } = nextBeat(state);
      let succeeded = false;
      try {
        const reply = await sendHeartbeat(attemptId, body);
        if (disposed) return;
        const acked = ackBeat(state, sentIds, reply);
        state = acked.state;
        succeeded = true;
        storeCursor(attemptId, state.cursor);
        if (reply.status === 'submitted') {
          stopped = true;
          callbacks.current.onStop('ATTEMPT_CLOSED');
        } else if (!reply.deviceOk) {
          stopped = true;
          callbacks.current.onStop('DEVICE_REVOKED');
        } else {
          if (reply.deadline)
            callbacks.current.onServerTime({
              deadline: reply.deadline,
              serverNow: reply.serverNow,
            });
          if (acked.fresh.length > 0) callbacks.current.onNotices(acked.fresh);
        }
      } catch (error) {
        if (disposed) return;
        const reason = stopReasonOf(error);
        if (reason) {
          stopped = true;
          callbacks.current.onStop(reason);
        }
        // Lỗi mạng: giữ nguyên sự kiện, nhịp sau gửi lại cùng mã nên server không ghi trùng.
      } finally {
        sending = false;
        // Sự kiện xảy ra lúc nhịp đang bay thì gửi tiếp ngay (chỉ khi nhịp vừa rồi thành công, để lỗi mạng không thành
        // vòng lặp dồn dập); còn lại chờ nhịp 15 giây.
        const next = again || (succeeded && state.pending.length > 0) ? 0 : HEARTBEAT_INTERVAL_MS;
        if (!stopped) timer = setTimeout(() => void beat(), next);
      }
    };

    const note = (type: HeartbeatEventType) => {
      state = recordEvent(state, type, newId());
    };
    // Gửi ngay cả khi ẩn: trình duyệt giãn bộ đếm của tab nền (khoảng một phút một lần), nên chờ nhịp sau thì Người ra đề
    // thấy muộn và có thể nhầm là mất kết nối.
    const onVisibility = () => {
      note(document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible');
      void beat();
    };
    const onOffline = () => note('went_offline');
    const onOnline = () => {
      note('back_online');
      void beat();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    void beat();

    // Kênh đẩy (PR 4d-3): Người ra đề vừa Cộng giờ, Buộc nộp, Cảnh cáo hay Thu hồi thì gửi heartbeat ngay thay vì chờ nhịp
    // 15 giây. Chờ ngẫu nhiên chút ít để Cộng giờ cả phòng không dồn 500 yêu cầu một lúc. Mất kênh thì nhịp 15 giây vẫn
    // chạy như cũ; nối lại thì gửi ngay để bù tin có thể đã lỡ.
    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
    let joinedBefore = false;
    const unsubscribe = realtime.subscribe({
      join: REALTIME_JOIN.attempt,
      payload: { attemptId },
      event: REALTIME_EVENT.attemptNudge,
      onEvent: () => {
        clearTimeout(nudgeTimer);
        nudgeTimer = setTimeout(() => void beat(), Math.random() * NUDGE_JITTER_MAX_MS);
      },
      // Lần vào phòng đầu đã có nhịp lúc mở màn; chỉ nối lại sau khi đứt mới gửi bù (tin có thể đã lỡ).
      onConnected: () => {
        if (joinedBefore) void beat();
        joinedBefore = true;
      },
    });
    return () => {
      unsubscribe();
      clearTimeout(nudgeTimer);
      disposed = true;
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [attemptId, active]);
}
