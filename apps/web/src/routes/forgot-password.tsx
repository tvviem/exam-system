import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forgotPassword } from '../lib/auth-links';
import { errorMessage } from '../lib/errors';
import { buttonClass, ErrorMessage, PrimaryButton, TextField } from '../lib/ui';
import { PublicShell } from '../lib/ui/auth-link-page';

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
});

/** Luôn hiện cùng một câu, dù tài khoản có tồn tại hay không (không cho dò tài khoản). */
function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const mutation = useMutation({ mutationFn: () => forgotPassword(identifier.trim()) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">{t('authLinks.forgot.heading')}</h1>
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
            {t('authLinks.forgot.sent')}
          </p>
          <Link to="/login" search={{ redirect: undefined }} className={buttonClass('secondary')}>
            {t('authLinks.forgot.back')}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-5 text-sm text-fg-muted">{t('authLinks.forgot.intro')}</p>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <TextField
              id="forgot-identifier"
              label={t('login.identifier')}
              autoComplete="username"
              autoCapitalize="none"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
            <PrimaryButton loading={mutation.isPending} type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('authLinks.forgot.sending') : t('authLinks.forgot.submit')}
            </PrimaryButton>
          </form>
        </>
      )}
    </PublicShell>
  );
}
