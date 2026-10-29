import type { ReactNode } from 'react';

/**
 * Thanh hành động chính của trang. Dính đáy màn hình để không cuộn khuất: trên điện thoại nằm ngay trên
 * thanh tab điều hướng (64 px), trên laptop dính cách đáy 16 px.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg lg:bottom-4">
      {children}
    </div>
  );
}
