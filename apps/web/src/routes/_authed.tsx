import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { logout, meQuery } from '../lib/auth';
import { ThemeSwitcher } from '../lib/ui/theme-switcher';

/** Layout cho mọi trang cần đăng nhập. Chưa đổi mật khẩu tạm thì chỉ vào được trang đổi mật khẩu. */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
    if (me.mustChangePassword && location.pathname !== '/change-password') {
      throw redirect({ to: '/change-password' });
    }
    return { me };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { t } = useTranslation();
  const { me } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login', search: { redirect: undefined } });
    },
  });

  return (
    <>
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="font-semibold">
            {t('app.title')}
          </Link>
          <span className="ml-auto truncate text-sm text-fg-muted">{me.fullName}</span>
          {!me.mustChangePassword && (
            <Link to="/account/auth-sessions" className="text-sm [&.active]:font-semibold">
              {t('nav.authSessions')}
            </Link>
          )}
          <button
            type="button"
            className="min-h-12 cursor-pointer rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary-soft"
            onClick={() => signOut.mutate()}
          >
            {t('nav.logout')}
          </button>
          <ThemeSwitcher />
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
