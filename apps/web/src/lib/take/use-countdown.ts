import { useEffect, useRef, useState } from 'react';
import { remainingMs, type ServerTime, type Warning, warningOf } from './clock';

// Đồng hồ làm bài (Q242): chỉ hiển thị. Chuyển mốc 5 phút và 1 phút thì rung (nếu máy hỗ trợ); nơi dùng tự xử lý
// `warning === 'over'`.

export function useCountdown(initial: { deadline: string; serverNow: string }) {
  const [sync, setSync] = useState<ServerTime>(() => ({
    ...initial,
    receivedAt: performance.now(),
  }));
  const [remaining, setRemaining] = useState(() => remainingMs(sync, performance.now()));
  const lastWarning = useRef<Warning>(warningOf(remaining));

  useEffect(() => {
    const tick = () => {
      const ms = remainingMs(sync, performance.now());
      setRemaining((previous) =>
        Math.ceil(previous / 1000) === Math.ceil(ms / 1000) ? previous : ms,
      );
      const level = warningOf(ms);
      if (level !== lastWarning.current) {
        lastWarning.current = level;
        if (level === 'five' || level === 'one') navigator.vibrate?.([200, 100, 200]);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [sync]);

  /** Nhận `deadline` và `serverNow` mới (mỗi response lưu bài), kể cả khi server Cộng giờ. */
  const resync = (time: { deadline: string; serverNow: string }) => {
    setSync({ ...time, receivedAt: performance.now() });
  };

  return { remaining, warning: warningOf(remaining), resync };
}
