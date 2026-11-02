import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/take')({
  beforeLoad: ({ context }) => {
    if (!context.me.roleTags.includes('candidate')) throw redirect({ to: '/' });
  },
  component: Outlet,
});
