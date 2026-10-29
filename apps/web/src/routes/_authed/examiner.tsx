import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_authed/examiner')({
  beforeLoad: ({ context }) => {
    if (!context.me.roleTags.includes('examiner')) throw redirect({ to: '/' });
  },
  component: ExaminerLayout,
});

const SECTIONS = [{ to: '/examiner/account-requests', key: 'accountRequests' }] as const;

function ExaminerLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label={t('nav.examiner')}
        className="flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="inline-flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-primary-soft hover:text-fg [&.active]:bg-primary-soft [&.active]:text-on-primary-soft"
          >
            {t(`nav.${s.key}`)}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
