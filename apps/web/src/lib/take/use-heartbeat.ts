import { useEffect, useRef } from 'react';
import { sendHeartbeat } from '../take';
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

export function useHeartbeat(options: {
  attemptId: string;
  /** Giờ server lúc mở Lượt: mốc đầu tiên để nhận thông báo mới. */
  since: string;
  onServerTime: (time: { deadline: string; serverNow: string }) => void;
  onStop: (reason: StopReason) => void;
  onNotices: (notices: Notice[]) => void;
}) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const { attemptId } = options;

  useEffect(() => {
    let state: HeartbeatState = emptyBeats(callbacks.current.since);
    let stopped = false;
    let sending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      if (stopped || sending) return;
      sending = true;
      clearTimeout(timer);
      const { body, sentIds } = nextBeat(state);
      try {
        const reply = await sendHeartbeat(attemptId, body);
        const acked = ackBeat(state, sentIds, reply);
        state = acked.state;
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
        const reason = stopReasonOf(error);
        if (reason) {
          stopped = true;
          callbacks.current.onStop(reason);
        }
        // Lỗi mạng: giữ nguyên sự kiện, nhịp sau gửi lại cùng mã nên server không ghi trùng.
      } finally {
        sending = false;
        if (!stopped) timer = setTimeout(() => void beat(), HEARTBEAT_INTERVAL_MS);
      }
    };

    const note = (type: HeartbeatEventType) => {
      state = recordEvent(state, type, crypto.randomUUID());
    };
    const onVisibility = () => {
      note(document.visibilityState === 'hidden' ? 'tab_hidden' : 'tab_visible');
      if (document.visibilityState === 'visible') void beat();
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
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [attemptId]);
}
