import { type SessionPhase, WAITING_PING_MS } from '@exam/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { takeSessionsQuery, waitingPing } from '../take';
import { remainingMs, type ServerClock, serverNowOf } from './countdown';

/**
 * Phòng chờ (Q284): hỏi server ngay khi vào rồi cứ 15 giây một lần để báo "còn trực tuyến"; đếm ngược theo đồng hồ server. Tới
 * giờ mở (hoặc server báo `canStart`) thì tải lại danh sách Phiên thi để màn chuyển sang cho bấm "Bắt đầu làm bài". Không tự bắt đầu.
 */
export function useWaitingRoom(sessionId: string, opensAt: string, active: boolean) {
  const queryClient = useQueryClient();
  const [opensAtMs, setOpensAtMs] = useState(() => Date.parse(opensAt));
  const clock = useRef<ServerClock>({ serverNowMs: Date.now(), receivedAt: performance.now() });
  const [remaining, setRemaining] = useState(() => remainingMs(opensAtMs, Date.now()));
  const opensAtRef = useRef(opensAtMs);
  opensAtRef.current = opensAtMs;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let lastPhase: SessionPhase = 'upcoming';
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: takeSessionsQuery.queryKey });
    const ping = async () => {
      try {
        const reply = await waitingPing(sessionId);
        if (stopped) return;
        clock.current = { serverNowMs: Date.parse(reply.serverNow), receivedAt: performance.now() };
        setOpensAtMs(Date.parse(reply.opensAt));
        // Chỉ tải lại danh sách ngay lúc Phiên thi chuyển từ sắp mở sang mở (hoặc đổi trạng thái khác).
        if (reply.phase !== lastPhase) {
          lastPhase = reply.phase;
          refresh();
        }
      } catch (error) {
        // Mất mạng thoáng qua: nhịp sau thử lại, không tải lại danh sách. Server từ chối (thu hồi thiết bị, hủy, đóng) thì danh sách báo đúng.
        if (!stopped && error instanceof ApiError) refresh();
      }
    };
    void ping();
    const pingTimer = setInterval(() => void ping(), WAITING_PING_MS);
    let reached = false;
    const tick = setInterval(() => {
      const left = remainingMs(opensAtRef.current, serverNowOf(clock.current, performance.now()));
      setRemaining(left);
      if (left === 0 && !reached) {
        reached = true;
        void ping();
      }
    }, 250);
    return () => {
      stopped = true;
      clearInterval(pingTimer);
      clearInterval(tick);
    };
  }, [active, sessionId, queryClient]);

  return remaining;
}
