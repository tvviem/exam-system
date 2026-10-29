import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_authed/take')({
  beforeLoad: ({ context }) => {
    if (!context.me.roleTags.includes('candidate')) throw redirect({ to: '/' });
  },
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-lg font-semibold">{t('nav.take')}</h1>
      <p className="mt-2 text-fg-muted">{t('placeholder')}</p>
    </section>
  );
}
