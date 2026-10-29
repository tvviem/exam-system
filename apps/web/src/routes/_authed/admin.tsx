import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: '/' });
  },
  // Điều hướng giữa các mục quản trị nằm ở khung ứng dụng (lib/ui/app-shell.tsx).
  component: Outlet,
});
