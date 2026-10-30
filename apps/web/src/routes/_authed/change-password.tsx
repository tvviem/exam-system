import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../../lib/ui';
import { PasswordForm } from '../../lib/ui/password-form';

export const Route = createFileRoute('/_authed/change-password')({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation();
  const { me } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold">{t('changePassword.heading')}</h1>
        {me.mustChangePassword && <p className="mt-2 text-fg-muted">{t('changePassword.intro')}</p>}
        <div className="mt-5">
          <PasswordForm
            onChanged={async () => {
              queryClient.removeQueries({ queryKey: ['auth'] });
              await navigate({ to: '/' });
            }}
          />
        </div>
      </Card>
    </div>
  );
}
