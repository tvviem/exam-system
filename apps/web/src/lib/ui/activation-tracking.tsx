import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AWAITING_STATES,
  quotaQuery,
  resendAll,
  TRACKING_STATES,
  type TrackingFilter,
  type TrackingRow,
  type TrackingState,
  trackingQuery,
} from '../account-support';
import { errorMessage } from '../errors';
import { formatDateTime } from '../format';
import { Badge, Button, ErrorMessage, PrimaryButton } from '.';
import { ChangeEmailDialog, SupportLinkDialog, type SupportTarget } from './account-support-card';
import { EmptyState, ListSkeleton, Pagination } from './admin';
import { Chip, ChipGroup } from './chips';
import { useToast } from './toast';

const TONES: Record<TrackingState, 'neutral' | 'primary' | 'success' | 'warning' | 'danger'> = {
  not_sent: 'neutral',
  sent: 'primary',
  mail_failed: 'danger',
  needs_check: 'warning',
  activated: 'success',
  email_unverified: 'warning',
};

const asTarget = (row: TrackingRow): SupportTarget => ({
  id: row.userId,
  fullName: row.fullName,
  email: row.email,
  pending: AWAITING_STATES.includes(row.state),
  emailVerified: row.state !== 'email_unverified',
  status: 'active',
});

/** Khung hạn mức thư (D-37): đã gửi trong 24 giờ, số thư đứng trước thư của mình và giờ dự kiến xong. */
function QuotaPanel() {
  const { t } = useTranslation();
  const quota = useQuery(quotaQuery());
  if (!quota.data) return null;
  const { sent24h, totalLimit, mine } = quota.data;
  return (
    <p className="rounded-lg bg-bg px-3 py-2 text-sm" aria-live="polite">
      {t('tracking.quota', { sent: sent24h, limit: totalLimit })}
      {mine.pending > 0 && (
        <>
          {' · '}
          {t('tracking.quotaMine', { count: mine.pending, ahead: mine.ahead })}
          {mine.estimatedDoneAt &&
            ` · ${t('tracking.quotaDone', { time: formatDateTime(mine.estimatedDoneAt) })}`}
        </>
      )}
    </p>
  );
}

/**
 * Bảng theo dõi kích hoạt của một Yêu cầu (ADR-0009, 7d-2): ai chưa kích hoạt, thư đang ở bước nào; Gửi lại cho tất cả,
 * Sửa email, Liên kết hỗ trợ cho từng người. Quyền do máy chủ quyết định.
 */
export function ActivationTracking({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TrackingFilter>({});
  const [dialog, setDialog] = useState<{ kind: 'email' | 'link'; row: TrackingRow } | null>(null);
  const board = useQuery(trackingQuery(requestId, filter));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['account-support'] });

  const all = useMutation({
    mutationFn: () => resendAll(requestId),
    onSuccess: async (result) => {
      toast(t('tracking.resendAllDone', result));
      await refresh();
    },
  });

  const counts = board.data?.counts;
  const awaiting = counts ? AWAITING_STATES.reduce((sum, s) => sum + counts[s], 0) : 0;
  const total = counts ? TRACKING_STATES.reduce((sum, s) => sum + counts[s], 0) : 0;
  const active = (f: TrackingFilter) => f.group === filter.group && f.state === filter.state;

  return (
    <section
      aria-labelledby="tracking-heading"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="tracking-heading" className="text-base font-semibold">
        {t('tracking.heading')}
      </h2>
      <QuotaPanel />

      {board.isPending ? (
        <ListSkeleton rows={2} />
      ) : board.isError ? (
        <ErrorMessage>{errorMessage(t, board.error)}</ErrorMessage>
      ) : (
        <>
          <ChipGroup label={t('tracking.filter')}>
            <Chip active={active({})} count={total} onClick={() => setFilter({})}>
              {t('tracking.all')}
            </Chip>
            <Chip
              active={active({ group: 'awaiting' })}
              count={awaiting}
              onClick={() => setFilter({ group: 'awaiting' })}
            >
              {t('tracking.awaiting')}
            </Chip>
            {TRACKING_STATES.map((state) => (
              <Chip
                key={state}
                active={active({ state })}
                count={counts?.[state] ?? 0}
                onClick={() => setFilter({ state })}
              >
                {t(`tracking.state.${state}`)}
              </Chip>
            ))}
          </ChipGroup>

          {awaiting > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <PrimaryButton
                type="button"
                loading={all.isPending}
                disabled={all.isPending}
                onClick={() => all.mutate()}
              >
                {t('tracking.resendAll')}
              </PrimaryButton>
              <p className="text-sm text-fg-muted">{t('tracking.resendAllHint')}</p>
            </div>
          )}
          <ErrorMessage>{all.isError && errorMessage(t, all.error)}</ErrorMessage>

          {board.data.items.length === 0 ? (
            <EmptyState>{t('tracking.empty')}</EmptyState>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {board.data.items.map((row) => (
                  <TrackingItem
                    key={row.userId}
                    row={row}
                    onAction={(kind) => setDialog({ kind, row })}
                  />
                ))}
              </ul>
              <Pagination
                page={board.data.page}
                pageSize={board.data.pageSize}
                total={board.data.total}
                onPage={(next) => setFilter({ ...filter, page: next > 1 ? next : undefined })}
              />
            </>
          )}
        </>
      )}

      {dialog?.kind === 'email' && (
        <ChangeEmailDialog
          target={asTarget(dialog.row)}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            toast(t('accountSupport.emailChanged'));
            await refresh();
          }}
        />
      )}
      {dialog?.kind === 'link' && (
        <SupportLinkDialog
          target={asTarget(dialog.row)}
          onClose={() => setDialog(null)}
          onDone={refresh}
        />
      )}
    </section>
  );
}

function TrackingItem({
  row,
  onAction,
}: {
  row: TrackingRow;
  onAction: (kind: 'email' | 'link') => void;
}) {
  const { t } = useTranslation();
  const needsHelp = AWAITING_STATES.includes(row.state);
  const canAct = needsHelp && row.actionable;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium break-words">{row.fullName}</span>
        <span className="text-sm text-fg-muted break-all">
          {[row.code, row.email].filter(Boolean).join(' · ')}
        </span>
      </div>
      <Badge tone={TONES[row.state]}>{t(`tracking.state.${row.state}`)}</Badge>
      {needsHelp && !row.actionable && (
        <span className="text-sm text-fg-muted">{t('tracking.viewOnly')}</span>
      )}
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            aria-label={t('tracking.changeEmailOf', { name: row.fullName })}
            onClick={() => onAction('email')}
          >
            {t('tracking.changeEmail')}
          </Button>
          <Button
            type="button"
            aria-label={t('tracking.linkOf', { name: row.fullName })}
            onClick={() => onAction('link')}
          >
            {t('tracking.link')}
          </Button>
        </div>
      )}
    </li>
  );
}
