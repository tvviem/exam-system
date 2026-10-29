import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { homePathFor } from '../../lib/auth';

export const Route = createFileRoute('/_authed/')({
  beforeLoad: ({ context }) => {
    const home = homePathFor(context.me);
    if (home) throw redirect({ to: home });
  },
  component: NoRolePage,
});

function NoRolePage() {
  const { t } = useTranslation();
  return <p className="text-fg-muted">{t('home.noRole')}</p>;
}
