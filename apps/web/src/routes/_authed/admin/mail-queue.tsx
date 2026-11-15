import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { mailQueueQuery } from '../../../lib/account-support';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { Badge, Card, ErrorMessage } from '../../../lib/ui';
import { EmptyState, ListSkeleton } from '../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/admin/mail-queue')({
  component: MailQueuePage,
});

const STATUSES = ['pending', 'sending', 'sent', 'failed', 'rejected'] as const;
const TONES = {
  pending: 'neutral',
  sending: 'primary',
  sent: 'success',
  failed: 'danger',
  rejected: 'danger',
} as const;

/** Màn Hàng đợi thư của Quản trị viên (7d-2, D-39): số theo trạng thái, 24 giờ so với trần, thư chưa gửi được. KHÔNG hiện mã. */
function MailQueuePage() {
  const { t } = useTranslation();
  const queue = useQuery(mailQueueQuery());
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('mailQueue.title')}</h1>
      <p className="text-sm text-fg-muted">{t('mailQueue.intro')}</p>
      {queue.isPending ? (
        <ListSkeleton rows={3} />
      ) : queue.isError ? (
        <ErrorMessage>{errorMessage(t, queue.error)}</ErrorMessage>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <p className="font-medium" aria-live="polite">
              {t('mailQueue.quota', { sent: queue.data.sent24h, limit: queue.data.totalLimit })}
            </p>
            <dl
              className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-5"
              aria-label={t('mailQueue.counts')}
            >
              {STATUSES.map((status) => (
                <div key={status} className="flex flex-col gap-1">
                  <dt className="text-sm text-fg-muted">{t(`mailQueue.status.${status}`)}</dt>
                  <dd className="m-0 text-xl font-semibold">{queue.data.counts[status]}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <h2 className="text-base font-semibold">{t('mailQueue.unsent')}</h2>
          {queue.data.items.length === 0 ? (
            <EmptyState>{t('mailQueue.emptyUnsent')}</EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {queue.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium break-all">{item.toEmail}</span>
                    <Badge tone={TONES[item.status]}>{t(`mailQueue.status.${item.status}`)}</Badge>
                    <Badge>{t(`mailQueue.lane.${item.lane}`)}</Badge>
                  </div>
                  <p className="text-sm text-fg-muted">
                    {item.kind} · {formatDateTime(item.createdAt)} · {t('mailQueue.attempts')}:{' '}
                    {item.attemptCount}
                  </p>
                  {item.lastError && (
                    <p className="text-sm break-words">
                      <span className="text-fg-muted">{t('mailQueue.error')}: </span>
                      {item.lastError}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
