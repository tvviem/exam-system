import { createFileRoute } from '@tanstack/react-router';
import { AccountRequestView } from '../../../../lib/ui/account-request';

export const Route = createFileRoute('/_authed/examiner/account-requests/$requestId')({
  component: ExaminerAccountRequestPage,
});

function ExaminerAccountRequestPage() {
  const { requestId } = Route.useParams();
  return <AccountRequestView id={requestId} admin={false} />;
}
