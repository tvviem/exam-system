import { Ban, Check, ChevronLeft, ChevronRight, Copy, Lock, TriangleAlert } from 'lucide-react';
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
 * Mật khẩu tạm chỉ hiển thị một lần: chữ đơn cách cỡ lớn, nút Sao chép, phải xác nhận đã lưu mới
 * đóng được (không đóng bằng Esc hay bấm ra ngoài).
 */
export function TemporaryPasswordDialog({
  value,
  onClose,
}: {
  value: { temporaryPassword: string; passwordExpiresAt: string; title: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value.temporaryPassword);
    setCopied(true);
  };
  return (
    <Dialog open={value !== null} dismissible={false} onClose={onClose} title={value?.title ?? ''}>
      {value && (
        <>
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('temporaryPassword.onlyOnce')}
          </p>
          <div className="flex items-center gap-2">
            <output
              data-testid="temporary-password"
              className="flex-1 rounded-lg border border-border-strong bg-bg px-3 py-3 text-center font-mono text-2xl tracking-widest select-all"
            >
              {value.temporaryPassword}
            </output>
            <Button onClick={copy} aria-label={t('temporaryPassword.copy')}>
              {copied ? (
                <Check aria-hidden className="size-5" />
              ) : (
                <Copy aria-hidden className="size-5" />
              )}
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            {t('temporaryPassword.expires', { time: formatDateTime(value.passwordExpiresAt) })}
          </p>
          <PrimaryButton
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            {t('temporaryPassword.saved')}
          </PrimaryButton>
        </>
      )}
    </Dialog>
  );
}
