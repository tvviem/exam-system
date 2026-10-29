import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/examiner/')({
  beforeLoad: () => {
    throw redirect({ to: '/examiner/account-requests' });
  },
});
