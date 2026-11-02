import { useCallback, useEffect, useState } from 'react';
import { defaultViewMode, PREFS_KEY, type Prefs, parsePrefs } from './prefs';

/** Tùy chọn hiển thị của Người dự thi, nhớ trên từng thiết bị; bộ nhớ bị chặn thì vẫn dùng được trong lần mở này. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return parsePrefs(localStorage.getItem(PREFS_KEY));
    } catch {
      return parsePrefs(null);
    }
  });
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const update = useCallback((change: Partial<Prefs>) => {
    setPrefs((previous) => {
      const next = { ...previous, ...change };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Không lưu được thì thôi.
      }
      return next;
    });
  }, []);

  const mode = prefs.viewMode === 'auto' ? defaultViewMode(width) : prefs.viewMode;
  return { prefs, update, mode };
}
