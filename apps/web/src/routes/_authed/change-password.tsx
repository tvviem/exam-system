import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { Card, ErrorMessage, PrimaryButton, TextField } from '../../lib/ui';

export const Route = createFileRoute('/_authed/change-password')({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation();
  const { me } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      await navigate({ to: '/' });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMismatch(next !== confirm);
    if (next === confirm) mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-2xl font-semibold">{t('changePassword.heading')}</h1>
        {me.mustChangePassword && (
          <p className="mt-2 text-slate-600">{t('changePassword.intro')}</p>
        )}
        <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
          <TextField
            id="current-password"
            label={t('changePassword.current')}
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            id="new-password"
            label={t('changePassword.new')}
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <TextField
            id="confirm-password"
            label={t('changePassword.confirm')}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="text-sm text-slate-600">{t('changePassword.hint')}</p>
          <ErrorMessage>
            {mismatch
              ? t('changePassword.mismatch')
              : mutation.isError && errorMessage(t, mutation.error)}
          </ErrorMessage>
          <PrimaryButton type="submit" disabled={mutation.isPending}>
            {t('changePassword.submit')}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
