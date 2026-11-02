import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultViewMode, PREFS_KEY, type Prefs, parsePrefs, WIDE_PX } from './prefs';

const WIDE_QUERY = `(min-width: ${WIDE_PX}px)`;

/** Tùy chọn hiển thị của Người dự thi, nhớ trên từng thiết bị; bộ nhớ bị chặn thì vẫn dùng được trong lần mở này. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return parsePrefs(localStorage.getItem(PREFS_KEY));
    } catch {
      return parsePrefs(null);
    }
  });
  // Chỉ dựng lại khi vượt ngưỡng bề rộng, không phải mỗi lần đổi kích thước cửa sổ.
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Ghi vào localStorage sau khi dựng, không ghi trong hàm cập nhật state (React có thể gọi hàm đó hai lần).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Không lưu được thì thôi.
    }
  }, [prefs]);

  const update = useCallback(
    (change: Partial<Prefs>) => setPrefs((previous) => ({ ...previous, ...change })),
    [],
  );

  const mode = prefs.viewMode === 'auto' ? defaultViewMode(wide ? WIDE_PX : 0) : prefs.viewMode;
  return { prefs, update, mode };
}
