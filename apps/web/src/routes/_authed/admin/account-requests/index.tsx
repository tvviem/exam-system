import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ACCOUNT_REQUEST_STATUSES,
  type AccountRequestParams,
  type AccountRequestStatus,
  accountRequestsQuery,
} from '../../../../lib/account-requests';
import { errorMessage } from '../../../../lib/errors';
import { ErrorMessage, SelectField } from '../../../../lib/ui';
import { RequestListItem } from '../../../../lib/ui/account-request-list';
import { EmptyState, ListSkeleton, Pagination } from '../../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/admin/account-requests/')({
  validateSearch: (search: Record<string, unknown>): AccountRequestParams => ({
    status: ACCOUNT_REQUEST_STATUSES.includes(search.status as AccountRequestStatus)
      ? (search.status as AccountRequestStatus)
      : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: AdminAccountRequestsPage,
});

function AdminAccountRequestsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const requests = useQuery(accountRequestsQuery(search));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('accountRequests.heading')}</h1>
      <div className="sm:w-64">
        <SelectField
          id="filter-request-status"
          label={t('accountRequests.filterStatus')}
          value={search.status ?? ''}
          onChange={(e) =>
            navigate({
              search: (s) => ({
                ...s,
                status: (e.target.value || undefined) as AccountRequestStatus | undefined,
                page: undefined,
              }),
            })
          }
        >
          <option value="">{t('accountRequests.allStatuses')}</option>
          {ACCOUNT_REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`accountRequestStatus.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {requests.isPending ? (
        <ListSkeleton />
      ) : requests.isError ? (
        <ErrorMessage>{errorMessage(t, requests.error)}</ErrorMessage>
      ) : requests.data.items.length === 0 ? (
        <EmptyState>{t('accountRequests.empty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {requests.data.items.map((item) => (
              <li key={item.id}>
                <RequestListItem item={item} admin />
              </li>
            ))}
          </ul>
          <Pagination
            page={requests.data.page}
            pageSize={requests.data.pageSize}
            total={requests.data.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}
    </section>
  );
}
