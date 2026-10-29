import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  type AccountRequestItemParams,
  MATCH_STATUSES,
  type MatchStatus,
} from '../../../../lib/account-requests';
import { AccountRequestView } from '../../../../lib/ui/account-request';

export const Route = createFileRoute('/_authed/admin/account-requests/$requestId')({
  validateSearch: (search: Record<string, unknown>): AccountRequestItemParams => ({
    matchStatus: MATCH_STATUSES.includes(search.matchStatus as MatchStatus)
      ? (search.matchStatus as MatchStatus)
      : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: AdminAccountRequestPage,
});

function AdminAccountRequestPage() {
  const { requestId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AccountRequestView
      id={requestId}
      admin={true}
      filter={search}
      onFilterChange={(next) => navigate({ search: next })}
    />
  );
}
