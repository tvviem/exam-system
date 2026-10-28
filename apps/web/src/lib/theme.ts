import { useEffect, useState } from 'react';

/** Lựa chọn sáng/tối, nhớ trên từng thiết bị (Q71). Đồng bộ với public/theme-init.js. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'exam:theme';
// Màu thanh địa chỉ trên điện thoại = màu `surface` của thanh trên cùng.
const THEME_COLOR = { light: '#ffffff', dark: '#0f172a' } as const;
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const theme = choice === 'system' ? (darkQuery().matches ? 'dark' : 'light') : choice;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Trình duyệt chặn lưu trữ: vẫn đổi được chế độ trong lần mở trang này.
    }
    if (choice !== 'system') return;
    const query = darkQuery();
    const follow = () => apply('system');
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [choice]);

  return [choice, setChoice] as const;
}
