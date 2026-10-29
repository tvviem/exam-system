import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: '/' });
  },
  component: AdminLayout,
});

const SECTIONS = [
  { to: '/admin/users', key: 'users' },
  { to: '/admin/units', key: 'units' },
  { to: '/admin/login-events', key: 'loginEvents' },
  { to: '/admin/audit-logs', key: 'auditLogs' },
] as const;

function AdminLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={t('nav.admin')} className="flex flex-wrap gap-1 border-b border-border pb-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="inline-flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-primary-soft hover:text-fg [&.active]:bg-primary-soft [&.active]:text-on-primary-soft"
          >
            {t(`admin.nav.${s.key}`)}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
