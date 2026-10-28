import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { login, meQuery, safeRedirect } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import { Card, ErrorMessage, PrimaryButton, TextField } from '../lib/ui';

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { redirect: next } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => login(identifier, password),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      await navigate({ to: next ?? '/' });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-4 text-center text-sm font-medium text-blue-800">{t('app.title')}</p>
      <Card>
        <h1 className="mb-5 text-2xl font-semibold">{t('login.heading')}</h1>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <TextField
            id="identifier"
            label={t('login.identifier')}
            autoComplete="username"
            autoCapitalize="none"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <TextField
            id="password"
            label={t('login.password')}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
          <PrimaryButton type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('login.submitting') : t('login.submit')}
          </PrimaryButton>
        </form>
      </Card>
    </main>
  );
}
