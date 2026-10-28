import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/examiner')({
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
