import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_authed/examiner')({
  beforeLoad: ({ context }) => {
    if (!context.me.roleTags.includes('examiner')) throw redirect({ to: '/' });
  },
  component: Page,
});

function Page() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-lg font-semibold">{t('nav.examiner')}</h1>
      <p className="mt-2 text-slate-600">{t('placeholder')}</p>
    </section>
  );
}
