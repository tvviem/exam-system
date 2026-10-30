import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Crumb {
  label: string;
  /** Không có `to` là trang hiện tại. */
  to?: string;
  search?: Record<string, string | undefined>;
}

/** Đường dẫn (docs/ui-design.md mục 9): Ngân hàng câu hỏi → Chủ đề → Câu hỏi. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('breadcrumb.label')} className="text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: dãy mục cố định theo trang
          <li key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden className="size-4" />}
            {item.to ? (
              <Link
                to={item.to}
                search={item.search}
                className="inline-flex min-h-12 items-center rounded px-1 hover:text-fg hover:underline pointer-fine:min-h-8"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
