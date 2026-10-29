import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/examiner')({
  beforeLoad: ({ context }) => {
    if (!context.me.roleTags.includes('examiner')) throw redirect({ to: '/' });
  },
  component: Outlet,
});
