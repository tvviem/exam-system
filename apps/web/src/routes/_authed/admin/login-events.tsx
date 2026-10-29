import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type LoginEventParams, loginEventsQuery } from '../../../lib/admin';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { Button, ErrorMessage, SelectField } from '../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/admin/login-events')({
  validateSearch: (search: Record<string, unknown>): LoginEventParams => ({
    userId: typeof search.userId === 'string' ? search.userId : undefined,
    success: search.success === 'true' || search.success === 'false' ? search.success : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: LoginEventsPage,
});

function LoginEventsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const events = useQuery(loginEventsQuery(search));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('admin.loginEvents.heading')}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <SelectField
            id="filter-success"
            label={t('admin.loginEvents.result')}
            value={search.success ?? ''}
            onChange={(e) =>
              navigate({
                search: (s) => ({
                  ...s,
                  success: (e.target.value || undefined) as LoginEventParams['success'],
                  page: undefined,
                }),
              })
            }
          >
            <option value="">{t('admin.loginEvents.all')}</option>
            <option value="true">{t('admin.loginEvents.success')}</option>
            <option value="false">{t('admin.loginEvents.failure')}</option>
          </SelectField>
        </div>
        {search.userId && (
          <Button
            onClick={() =>
              navigate({ search: (s) => ({ ...s, userId: undefined, page: undefined }) })
            }
          >
            {t('admin.loginEvents.clearUser')}
          </Button>
        )}
      </div>
      {events.isPending ? (
        <ListSkeleton />
      ) : events.isError ? (
        <ErrorMessage>{errorMessage(t, events.error)}</ErrorMessage>
      ) : events.data.items.length === 0 ? (
        <EmptyState>{t('admin.loginEvents.empty')}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {events.data.items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                {e.success ? (
                  <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <CircleX aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {e.userId ? (
                      <Link
                        to="/admin/users/$userId"
                        params={{ userId: e.userId }}
                        className="text-primary hover:underline"
                      >
                        {e.userName}
                      </Link>
                    ) : (
                      <span className="text-fg-muted">{t('admin.loginEvents.unknownAccount')}</span>
                    )}{' '}
                    <span className="text-sm font-normal text-fg-muted">({e.identifierTried})</span>
                  </p>
                  <p className="text-sm">
                    {e.success
                      ? t('admin.loginEvents.success')
                      : t(`errors.${e.failureReason}`, { defaultValue: e.failureReason ?? '' })}
                  </p>
                  <p className="text-sm text-fg-muted tabular-nums">
                    {formatDateTime(e.at)} · {e.ip}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={events.data.page}
            pageSize={events.data.pageSize}
            total={events.data.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}
    </section>
  );
}
