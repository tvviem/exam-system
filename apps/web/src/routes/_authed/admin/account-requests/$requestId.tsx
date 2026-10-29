import { createFileRoute } from '@tanstack/react-router';
import { AccountRequestView } from '../../../../lib/ui/account-request';

export const Route = createFileRoute('/_authed/admin/account-requests/$requestId')({
  component: AdminAccountRequestPage,
});

function AdminAccountRequestPage() {
  const { requestId } = Route.useParams();
  return <AccountRequestView id={requestId} admin />;
}
