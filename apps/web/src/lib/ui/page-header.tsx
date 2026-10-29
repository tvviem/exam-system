import type { ReactNode } from 'react';

/** Đầu trang (docs/ui-design.md mục 9): tiêu đề H1 và hành động chính cùng một hàng, tự xuống dòng khi hẹp. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {actions}
    </div>
  );
}
