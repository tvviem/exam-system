import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type AppealRow, appealsQuery } from '../../appeals';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import { Badge, ErrorMessage } from '..';
import { ListSkeleton } from '../admin';

// Danh sách Phúc khảo của Phiên thi cho Người ra đề (docs/plan/slice-5.md, PR 5d-2; Q313): chờ xử lý lên đầu, lọc theo trạng thái;
// bấm một dòng mở màn xử lý từng Phúc khảo.

type Filter = 'open' | 'resolved' | 'all';

/** "Câu 4 · Người dự thi thấy: Câu 7" (ghi chú đối chiếu ngắn) hoặc "Mức xử lý". */
export function appealSubject(
  t: (key: string, options?: Record<string, unknown>) => string,
  row: Pick<AppealRow, 'target' | 'no' | 'seenAs'>,
) {
  if (row.target === 'penalty') return t('appeal.penaltyLabel');
  const note =
    row.seenAs !== null && row.seenAs !== row.no
      ? ` · ${t('appeal.seenAs', { no: row.seenAs })}`
      : '';
  return `${t('grading.person.item', { no: row.no })}${note}`;
}

export function AppealsPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const list = useQuery(appealsQuery(sessionId));
  const [filter, setFilter] = useState<Filter>('open');
  if (list.isPending) return <ListSkeleton rows={4} />;
  if (list.isError) return <ErrorMessage>{errorMessage(t, list.error)}</ErrorMessage>;
  const { open, resolved, items } = list.data;
  const shown = items.filter((row) => filter === 'all' || row.status === filter);
  const filters: [Filter, string][] = [
    ['open', t('appeal.panel.open', { count: open })],
    ['resolved', t('appeal.panel.resolved', { count: resolved })],
    ['all', t('appeal.panel.all', { count: open + resolved })],
  ];
  return (
    <section className="flex flex-col gap-3" aria-label={t('appeal.panel.title')}>
      <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">{t('appeal.panel.filter')}</legend>
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`inline-flex min-h-12 cursor-pointer items-center rounded-lg border-2 px-3 text-sm font-semibold pointer-fine:min-h-9 ${
              filter === value
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border-strong bg-surface hover:bg-primary-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-fg-muted">
          {t(filter === 'resolved' ? 'appeal.panel.emptyResolved' : 'appeal.panel.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.id}>
              <Link
                to="/examiner/sessions/$sessionId/appeals"
                params={{ sessionId }}
                search={{ appeal: row.id }}
                className="flex min-h-14 flex-col gap-1 rounded-xl border border-border bg-surface p-3 hover:bg-primary-soft"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {row.user.fullName}
                    {row.user.code ? (
                      <span className="font-normal text-fg-muted"> · {row.user.code}</span>
                    ) : null}
                  </span>
                  <Badge tone={row.status === 'open' ? 'warning' : 'success'}>
                    {t(`appeal.panel.status.${row.status}`)}
                  </Badge>
                </span>
                <span className="text-sm text-fg-muted">
                  {appealSubject(t, row)} · {formatDateTime(row.createdAt)}
                </span>
                <span className="line-clamp-2 text-sm">{row.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
