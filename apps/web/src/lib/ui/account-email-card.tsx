import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Account, requestEmailChange, requestEmailVerification } from '../account';
import { errorMessage } from '../errors';
import { Badge, Card, ErrorMessage, PrimaryButton, TextField } from '.';

/**
 * Mục Email ở trang Tài khoản: hiện địa chỉ và trạng thái xác thực, "Gửi thư xác thực" cho email đang lưu, và Đổi email (cần mật
 * khẩu hiện tại; email chỉ đổi khi bấm liên kết trong thư gửi tới địa chỉ mới).
 */
export function AccountEmailCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  // Một thông báo duy nhất tại một thời điểm (đã gửi thư xác thực, hoặc đã gửi thư xác nhận đổi email).
  const [notice, setNotice] = useState<string | null>(null);

  const verification = useMutation({
    mutationFn: requestEmailVerification,
    onMutate: () => setNotice(null),
    onSuccess: () => setNotice(t('account.email.verificationSent', { email: account.email })),
  });
  const change = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim(), password),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      setNotice(t('account.email.changeSent', { email: newEmail.trim() }));
      setNewEmail('');
      setPassword('');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };
  const error = verification.error ?? change.error;

  return (
    <Card className="flex flex-col gap-4">
      <section aria-labelledby="account-email-heading" className="flex flex-col gap-4">
        <h2 id="account-email-heading" className="text-base font-semibold">
          {t('account.email.heading')}
        </h2>
        <p className="text-sm text-fg-muted">{t('account.email.intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">{account.email ?? t('account.email.none')}</span>
          {account.email && (
            <Badge tone={account.emailVerified ? 'success' : 'warning'}>
              {account.emailVerified ? t('account.email.verified') : t('account.email.unverified')}
            </Badge>
          )}
        </div>
        {account.email && !account.emailVerified && (
          <PrimaryButton
            type="button"
            loading={verification.isPending}
            disabled={verification.isPending}
            onClick={() => verification.mutate()}
          >
            {verification.isPending
              ? t('account.email.sendingVerification')
              : t('account.email.sendVerification')}
          </PrimaryButton>
        )}
        <form className="flex flex-col gap-4 border-t border-border pt-4" onSubmit={submit}>
          <h3 className="text-sm font-semibold">{t('account.email.changeHeading')}</h3>
          <TextField
            id="account-new-email"
            label={t('account.email.newEmail')}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <TextField
            id="account-email-password"
            label={t('account.email.currentPassword')}
            hint={t('account.email.currentPasswordHint')}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorMessage>{error && errorMessage(t, error)}</ErrorMessage>
          {notice && (
            <p role="status" className="rounded-lg bg-primary-soft px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <PrimaryButton type="submit" loading={change.isPending} disabled={change.isPending}>
            {change.isPending ? t('account.email.changeSending') : t('account.email.changeSubmit')}
          </PrimaryButton>
        </form>
      </section>
    </Card>
  );
}
