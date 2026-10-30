import type { ReactNode } from 'react';

/**
 * Thanh hành động chính của trang. Dính đáy màn hình để không cuộn khuất: trên điện thoại nằm ngay trên
 * thanh tab điều hướng (64 px), trên laptop dính cách đáy 16 px. Điện thoại: rộng hết hàng; laptop: gọn như một
 * thanh nổi vừa đủ nội dung, căn giữa (`center`) hoặc về bên phải (`end`, nơi mắt tìm nút Lưu).
 */
export function StickyActionBar({
  children,
  align = 'center',
}: {
  children: ReactNode;
  align?: 'center' | 'end';
}) {
  return (
    <div
      className={`lg:w-fit lg:max-w-full ${align === 'end' ? 'lg:self-end' : 'lg:self-center'} sticky bottom-[calc(var(--app-tabbar-h)+0.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg lg:bottom-4 lg:py-3`}
    >
      {children}
    </div>
  );
}
