import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import {
  CircleUserRound,
  ClipboardPenLine,
  LogOut,
  MonitorSmartphone,
  NotebookPen,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logout, type Me, meQuery } from '../lib/auth';
import { Button, Dialog } from '../lib/ui';
import { AppShell, navFor } from '../lib/ui/app-shell';
import { NotificationBell } from '../lib/ui/notification-bell';
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
      <AppShell
        items={navFor(me)}
        variant={
          me.roleTags.includes('candidate') && !me.isAdmin && !me.roleTags.includes('examiner')
            ? 'top'
            : 'sidebar'
        }
        actions={
          <>
            {!me.mustChangePassword && <NotificationBell isAdmin={me.isAdmin} />}
            <button
              type="button"
              aria-label={t('nav.accountMenu')}
              aria-haspopup="dialog"
              className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm text-fg-muted hover:bg-primary-soft hover:text-fg"
              onClick={() => setMenuOpen(true)}
            >
              <span className="hidden max-w-48 truncate sm:inline">{me.fullName}</span>
              <CircleUserRound aria-hidden className="size-6" />
            </button>
          </>
        }
      >
        <Outlet />
      </AppShell>
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={me.fullName}>
        <div className="flex flex-col gap-4">
          {!me.mustChangePassword && (
            <Link
              to="/account"
              onClick={() => setMenuOpen(false)}
              className="inline-flex min-h-12 items-center gap-3 rounded-lg px-2 font-medium hover:bg-primary-soft"
            >
              <UserRound aria-hidden className="size-5 text-fg-muted" />
              {t('nav.myAccount')}
            </Link>
          )}
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
          {!me.mustChangePassword && !me.isAdmin && (
            <AreaSwitch me={me} onPick={() => setMenuOpen(false)} />
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
    </>
  );
}

/** Người mang cả hai Nhãn vai trò (Q143) chuyển giữa khu Soạn đề và khu Làm bài. */
function AreaSwitch({ me, onPick }: { me: Me; onPick: () => void }) {
  const { t } = useTranslation();
  const examiner = me.roleTags.includes('examiner');
  const candidate = me.roleTags.includes('candidate');
  if (!examiner || !candidate) return null;
  const cls =
    'inline-flex min-h-12 items-center gap-3 rounded-lg px-2 font-medium hover:bg-primary-soft';
  return (
    <>
      <Link to="/examiner" onClick={onPick} className={cls}>
        <NotebookPen aria-hidden className="size-5 text-fg-muted" />
        {t('nav.areaExaminer')}
      </Link>
      <Link to="/take" onClick={onPick} className={cls}>
        <ClipboardPenLine aria-hidden className="size-5 text-fg-muted" />
        {t('nav.areaTake')}
      </Link>
    </>
  );
}
