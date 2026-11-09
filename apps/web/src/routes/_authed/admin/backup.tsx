import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type BackupRun, backupQuery, STALE_AFTER_HOURS } from '../../../lib/backup';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime, formatFileSize } from '../../../lib/format';
import { Badge, ErrorMessage } from '../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/admin/backup')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: BackupPage,
});

/** "5 phút trước", "2 giờ trước", "3 ngày trước". */
function useAgeText() {
  const { t } = useTranslation();
  return (iso: string) => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
    if (minutes < 60) return t('admin.backup.ageMinutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return t('admin.backup.ageHours', { count: hours });
    return t('admin.backup.ageDays', { count: Math.floor(hours / 24) });
  };
}

function BackupPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const overview = useQuery(backupQuery(search));
  const ageText = useAgeText();

  if (overview.isPending) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('admin.backup.heading')}</h1>
        <ListSkeleton />
      </section>
    );
  }
  if (overview.isError) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('admin.backup.heading')}</h1>
        <ErrorMessage>{errorMessage(t, overview.error)}</ErrorMessage>
      </section>
    );
  }
  const { summary, runs } = overview.data;
  const nightlyStale =
    summary.nightly !== null &&
    Date.now() - new Date(summary.nightly.finishedAt).getTime() > STALE_AFTER_HOURS * 3_600_000;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('admin.backup.heading')}</h1>
      <p className="text-sm text-fg-muted">{t('admin.backup.intro')}</p>

      {summary.issues.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-danger"
        >
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            {t('admin.backup.issues')}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {summary.issues.map((run) => (
              <li key={run.id}>
                <span className="font-medium">{kindLabel(t, run.kind)}</span>
                {t('admin.backup.issueSince', { at: formatDateTime(run.finishedAt) })}
                {run.detail ? `: ${run.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          title={t('admin.backup.nightly')}
          run={summary.nightly}
          ageText={ageText}
          warning={nightlyStale ? t('admin.backup.stale', { hours: STALE_AFTER_HOURS }) : undefined}
        />
        <SummaryCard title={t('admin.backup.base')} run={summary.base} ageText={ageText} />
        <SummaryCard
          title={t('admin.backup.restoreTest')}
          run={summary.restoreTest}
          ageText={ageText}
        />
      </dl>

      <h2 className="text-lg font-semibold">{t('admin.backup.recent')}</h2>
      {runs.items.length === 0 ? (
        <EmptyState>{t('admin.backup.empty')}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {runs.items.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
          <Pagination
            page={runs.page}
            pageSize={runs.pageSize}
            total={runs.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}
    </section>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

const kindLabel = (t: Translate, kind: string) =>
  t(`admin.backup.kind.${kind}`, { defaultValue: kind });

function runFacts(t: Translate, run: BackupRun): string {
  const facts: string[] = [];
  if (run.bytes !== null) facts.push(formatFileSize(run.bytes));
  if (run.seconds !== null) facts.push(t('admin.backup.seconds', { count: run.seconds }));
  return facts.join(' · ');
}

function SummaryCard({
  title,
  run,
  ageText,
  warning,
}: {
  title: string;
  run: BackupRun | null;
  ageText: (iso: string) => string;
  warning?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <dt className="text-sm text-fg-muted">{title}</dt>
      <dd className="flex flex-col gap-1">
        {run === null ? (
          <span className="text-fg-muted">{t('admin.backup.none')}</span>
        ) : (
          <>
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {ageText(run.finishedAt)}
              {run.status === 'ok' ? (
                <Badge tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
                  {t('admin.backup.ok')}
                </Badge>
              ) : (
                <Badge tone="danger" icon={<CircleX aria-hidden className="size-4" />}>
                  {t('admin.backup.failed')}
                </Badge>
              )}
            </span>
            <span className="text-sm text-fg-muted tabular-nums">
              {formatDateTime(run.finishedAt)}
              {runFacts(t, run) && ` · ${runFacts(t, run)}`}
            </span>
            {warning && (
              <span className="flex items-center gap-1 text-sm font-medium text-warning">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                {warning}
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

function RunRow({ run }: { run: BackupRun }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{kindLabel(t, run.kind)}</span>
        {run.status === 'ok' ? (
          <Badge tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
            {t('admin.backup.ok')}
          </Badge>
        ) : (
          <Badge tone="danger" icon={<CircleX aria-hidden className="size-4" />}>
            {t('admin.backup.failed')}
          </Badge>
        )}
      </div>
      <p className="text-sm text-fg-muted tabular-nums">
        {formatDateTime(run.finishedAt)}
        {runFacts(t, run) && ` · ${runFacts(t, run)}`}
      </p>
      {run.detail && <p className="text-sm break-words">{run.detail}</p>}
    </li>
  );
}
