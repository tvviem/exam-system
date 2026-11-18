import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  type AccountRequestItemParams,
  ITEM_GROUPS,
  type ItemGroup,
} from '../../../../lib/account-requests';
import { AccountRequestView } from '../../../../lib/ui/account-request';

export const Route = createFileRoute('/_authed/admin/account-requests/$requestId')({
  validateSearch: (search: Record<string, unknown>): AccountRequestItemParams => ({
    group: ITEM_GROUPS.includes(search.group as ItemGroup)
      ? (search.group as ItemGroup)
      : undefined,
    existing: search.existing === true || search.existing === 'true' ? true : undefined,
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
