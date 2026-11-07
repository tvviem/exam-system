import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { delegatedSessionsQuery } from '../../../../lib/grading';
import { PHASE_TONE, releaseLabelKey } from '../../../../lib/session-phase';
import { SESSION_PHASES, type SessionPhase, sessionsQuery } from '../../../../lib/sessions';
import { Badge, buttonClass, ErrorMessage, SearchField } from '../../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../../lib/ui/admin';
import { Chip, ChipGroup } from '../../../../lib/ui/chips';
import { PageHeader } from '../../../../lib/ui/page-header';

export const Route = createFileRoute('/_authed/examiner/sessions/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { phase?: SessionPhase; q?: string; page?: number } => ({
    phase: SESSION_PHASES.includes(search.phase as SessionPhase)
      ? (search.phase as SessionPhase)
      : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: SessionsPage,
});

function SessionsPage() {
  const { t } = useTranslation();
  const { phase, q, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sessions = useQuery(sessionsQuery({ phase, q, page }));
  const delegated = useQuery(delegatedSessionsQuery);
  const [text, setText] = useState(q ?? '');

  // Chờ gõ xong một nhịp rồi mới đưa từ khóa lên địa chỉ (và hỏi api).
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim() || undefined;
      if (next !== q) navigate({ search: (s) => ({ ...s, q: next, page: undefined }) });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const setPhase = (next?: SessionPhase) =>
    navigate({ search: (s) => ({ ...s, phase: next, page: undefined }) });

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={t('session.title')}
        actions={
          <Link to="/examiner/sessions/new" className={buttonClass('primary')}>
            <Plus aria-hidden className="size-5" />
            {t('session.create')}
          </Link>
        }
      />
      {(delegated.data?.items.length ?? 0) > 0 && (
        <section aria-labelledby="delegated-heading" className="flex flex-col gap-2">
          <h2 id="delegated-heading" className="text-base font-semibold">
            {t('grading.delegated.heading')}
          </h2>
          <ul className="flex flex-col gap-2">
            {delegated.data?.items.map((item) => (
              <li key={item.sessionId}>
                <Link
                  to="/examiner/sessions/$sessionId/results"
                  params={{ sessionId: item.sessionId }}
                  className="flex min-h-12 flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-primary-soft"
                >
                  <span className="break-words font-medium">{item.title}</span>
                  <span className="text-sm text-fg-muted">
                    {t('grading.delegated.owner', { name: item.ownerName ?? '—' })} ·{' '}
                    {formatDateTime(item.opensAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_1fr] sm:items-end">
        <SearchField
          id="session-search"
          label={t('session.search')}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        <ChipGroup label={t('session.filterPhase')}>
          <Chip active={!phase} onClick={() => setPhase(undefined)}>
            {t('session.phaseAll')}
          </Chip>
          {SESSION_PHASES.map((value) => (
            <Chip key={value} active={phase === value} onClick={() => setPhase(value)}>
              {t(`session.phase.${value}`)}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {sessions.isPending ? (
        <ListSkeleton rows={4} />
      ) : sessions.isError ? (
        <ErrorMessage>{errorMessage(t, sessions.error)}</ErrorMessage>
      ) : sessions.data.items.length === 0 ? (
        <EmptyState>{q || phase ? t('session.listNoMatch') : t('session.listEmpty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {sessions.data.items.map((session) => (
              <li key={session.id}>
                <Link
                  to="/examiner/sessions/$sessionId"
                  params={{ sessionId: session.id }}
                  className="flex min-h-12 flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-primary-soft"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{session.title}</span>
                    <span className="flex items-center gap-1">
                      <Badge tone={PHASE_TONE[session.phase]}>
                        {t(`session.phase.${session.phase}`)}
                      </Badge>
                      {releaseLabelKey(session) && (
                        <Badge tone="success">{t(releaseLabelKey(session) as string)}</Badge>
                      )}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {t('session.meta', { exam: session.examTitle, count: session.rosterCount })}
                  </span>
                  <span className="text-sm text-fg-muted">
                    {t('session.window', {
                      opens: formatDateTime(session.opensAt),
                      closes: formatDateTime(session.closesAt),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={sessions.data.page}
            pageSize={sessions.data.pageSize}
            total={sessions.data.total}
            onPage={(p) => navigate({ search: (s) => ({ ...s, page: p }) })}
          />
        </>
      )}
    </section>
  );
}
