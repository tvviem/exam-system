import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

function RootLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Link to="/" className="font-semibold">
            {t('app.title')}
          </Link>
          <div className="ml-auto flex gap-3 text-sm">
            <Link to="/take" className="[&.active]:font-semibold">
              {t('nav.take')}
            </Link>
            <Link to="/examiner" className="[&.active]:font-semibold">
              {t('nav.examiner')}
            </Link>
            <Link to="/admin" className="[&.active]:font-semibold">
              {t('nav.admin')}
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
