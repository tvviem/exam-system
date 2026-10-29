import { Ban, Check, ChevronLeft, ChevronRight, Copy, Lock, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserStatus } from '../admin';
import { formatDateTime } from '../format';
import { Badge, Button, Dialog, PrimaryButton } from '.';

// Mẫu dùng cho trang quản trị (docs/ui-design.md mục 7).

export function StatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  if (status === 'locked') {
    return (
      <Badge tone="danger" icon={<Lock aria-hidden className="size-3" />}>
        {t('userStatus.locked')}
      </Badge>
    );
  }
  if (status === 'removed') {
    return (
      <Badge icon={<Ban aria-hidden className="size-3" />}>
        <span className="line-through">{t('userStatus.removed')}</span>
      </Badge>
    );
  }
  return <Badge tone="success">{t('userStatus.active')}</Badge>;
}

/** "1–20 / 134" kèm Trang trước / Trang sau. Trang hiện tại nằm trên URL. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label={t('pagination.label')} className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label={t('pagination.previous')}
      >
        <ChevronLeft aria-hidden className="size-5" />
        <span className="hidden sm:inline">{t('pagination.previous')}</span>
      </Button>
      <p className="text-sm text-fg-muted tabular-nums">
        {t('pagination.range', { from, to, total })}
      </p>
      <Button
        variant="ghost"
        disabled={to >= total}
        onClick={() => onPage(page + 1)}
        aria-label={t('pagination.next')}
      >
        <span className="hidden sm:inline">{t('pagination.next')}</span>
        <ChevronRight aria-hidden className="size-5" />
      </Button>
    </nav>
  );
}

/** Bộ lọc đang áp dụng mà không có ô chọn tương ứng (lọc theo người, theo đối tượng). */
export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-h-12 items-center gap-1 rounded-full bg-primary-soft pl-4 text-sm font-medium text-on-primary-soft">
      {label}
      <button
        type="button"
        aria-label={t('common.clearFilter', { label })}
        className="inline-flex size-12 cursor-pointer items-center justify-center rounded-full hover:bg-primary/10"
        onClick={onClear}
      >
        <X aria-hidden className="size-4" />
      </button>
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-fg-muted">
      {children}
    </p>
  );
}

/** Khung xương giữ chỗ khi đang tải, để trang không bị nhảy. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: danh sách giữ chỗ cố định
        <li key={i} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </ul>
  );
}

/**
 * Giá trị bí mật chỉ hiển thị một lần (mật khẩu tạm, link mời): nút Sao chép, phải xác nhận đã lưu mới
 * đóng được (không đóng bằng Esc hay bấm ra ngoài).
 */
export function ShowOnceDialog({
  title,
  warning,
  copyLabel,
  note,
  confirmLabel,
  testId,
  display,
  copyText,
  onClose,
}: {
  title: string;
  warning: string;
  copyLabel: string;
  note: string;
  confirmLabel: string;
  testId: string;
  /** Nội dung hiển thị trong ô giá trị (có thể kèm biểu tượng). */
  display: ReactNode;
  copyText: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
  };
  return (
    <Dialog open dismissible={false} onClose={onClose} title={title}>
      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {warning}
      </p>
      <div className="flex items-center gap-2">
        <output
          data-testid={testId}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border-strong bg-bg px-3 py-3 break-all select-all"
        >
          {display}
        </output>
        <Button onClick={copy} aria-label={copyLabel}>
          {copied ? (
            <Check aria-hidden className="size-5" />
          ) : (
            <Copy aria-hidden className="size-5" />
          )}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{note}</p>
      <PrimaryButton onClick={onClose}>{confirmLabel}</PrimaryButton>
    </Dialog>
  );
}

/** Mật khẩu tạm: chữ đơn cách cỡ lớn. */
export function TemporaryPasswordDialog({
  value,
  onClose,
}: {
  value: { temporaryPassword: string; passwordExpiresAt: string; title: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <ShowOnceDialog
      title={value.title}
      warning={t('temporaryPassword.onlyOnce')}
      copyLabel={t('temporaryPassword.copy')}
      note={t('temporaryPassword.expires', { time: formatDateTime(value.passwordExpiresAt) })}
      confirmLabel={t('temporaryPassword.saved')}
      testId="temporary-password"
      display={
        <span className="font-mono text-2xl tracking-widest">{value.temporaryPassword}</span>
      }
      copyText={value.temporaryPassword}
      onClose={onClose}
    />
  );
}
