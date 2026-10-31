import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Dấu thương hiệu: ô teal có biểu tượng và tên hệ thống (khung ứng dụng, đăng nhập, nhận Lời mời). */
export function BrandMark({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`flex min-w-0 items-center gap-2.5 font-semibold leading-tight ${className}`}>
      <span
        aria-hidden
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary"
      >
        <GraduationCap className="size-5" />
      </span>
      <span className="min-w-0 whitespace-nowrap">{t('app.title')}</span>
    </span>
  );
}
