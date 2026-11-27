import { useCallback, useSyncExternalStore } from 'react';

/** Màn từ 1024 px (breakpoint `lg` của Tailwind). */
export const WIDE_SCREEN = '(min-width: 1024px)';

/** Theo dõi một media query; dùng khi bố cục rộng và hẹp đặt cùng một ô nhập ở hai chỗ khác nhau. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
