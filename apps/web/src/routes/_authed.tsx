import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { CircleUserRound, LogOut, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logout, meQuery } from '../lib/auth';
import { Button, Dialog } from '../lib/ui';
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        <nav className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Link to="/" className="min-w-0 truncate font-semibold">
            {t('app.title')}
          </Link>
          <button
            type="button"
            aria-label={t('nav.accountMenu')}
            aria-haspopup="dialog"
            className="ml-auto inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm text-fg-muted hover:bg-primary-soft hover:text-fg"
            onClick={() => setMenuOpen(true)}
          >
            <span className="hidden max-w-48 truncate sm:inline">{me.fullName}</span>
            <CircleUserRound aria-hidden className="size-6" />
          </button>
        </nav>
      </header>
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={me.fullName}>
        <div className="flex flex-col gap-4">
          {!me.mustChangePassword && (
            <Link
              to="/account/auth-sessions"
              onClick={() => setMenuOpen(false)}
              className="inline-flex min-h-12 items-center gap-3 rounded-lg px-2 font-medium hover:bg-primary-soft"
            >
              <MonitorSmartphone aria-hidden className="size-5 text-fg-muted" />
              {t('nav.authSessions')}
            </Link>
          )}
          <div className="flex items-center justify-between gap-3 px-2">
            <span className="font-medium">{t('theme.label')}</span>
            <ThemeSwitcher />
          </div>
          <Button
            variant="danger-ghost"
            className="justify-start px-2"
            onClick={() => {
              setMenuOpen(false);
              signOut.mutate();
            }}
          >
            <LogOut aria-hidden className="size-5" />
            {t('nav.logout')}
          </Button>
        </div>
      </Dialog>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
