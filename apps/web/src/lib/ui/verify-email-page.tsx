import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmEmail, linkStatus, useLinkToken } from '../auth-links';
import { errorMessage } from '../errors';
import { buttonClass, ErrorMessage, PrimaryButton } from '.';
import { ListSkeleton } from './admin';
import { Problem, PublicShell } from './auth-link-page';

/**
 * Trang xác nhận email (liên kết đổi email hoặc "Gửi thư xác thực"): đọc mã từ mảnh `#`, xem mã còn dùng được không, rồi chỉ đổi
 * khi người dùng BẤM NÚT. Trình quét liên kết của hộp thư không bấm nút nên không vô tình xác nhận thay người dùng.
 */
export function VerifyEmailPage() {
  const token = useLinkToken();
  return <VerifyEmailContent key={token} token={token} />;
}

function VerifyEmailContent({ token }: { token: string }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<Awaited<ReturnType<typeof confirmEmail>> | null>(null);

  const status = useQuery({
    queryKey: ['auth-link', 'email_change', token],
    queryFn: () => linkStatus('email_change', token),
    enabled: token !== '',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const confirm = useMutation({
    mutationFn: () => confirmEmail(token),
    onSuccess: setOutcome,
  });

  if (token === '') return <Problem purpose="email_change" link={{ state: 'unknown' }} />;
  if (status.isPending) {
    return (
      <PublicShell>
        <ListSkeleton rows={2} />
      </PublicShell>
    );
  }
  if (status.isError) {
    return (
      <PublicShell>
        <ErrorMessage>{errorMessage(t, status.error)}</ErrorMessage>
      </PublicShell>
    );
  }
  if (outcome?.state === 'ok') {
    return (
      <PublicShell>
        <h1 className="mb-2 text-2xl font-semibold">{t('authLinks.email_change.doneHeading')}</h1>
        <p className="mb-5 text-sm text-fg-muted">{t('authLinks.emailDoneText')}</p>
        <Link to="/account" className={buttonClass('primary')}>
          {t('authLinks.backToAccount')}
        </Link>
      </PublicShell>
    );
  }
  const current = outcome ?? status.data;
  if (current.state !== 'ok') return <Problem purpose="email_change" link={current} />;

  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">{t('authLinks.email_change.heading')}</h1>
      <p className="mb-5 text-sm text-fg-muted">{t('authLinks.email_change.intro')}</p>
      <div className="flex flex-col gap-4">
        <ErrorMessage>{confirm.isError && errorMessage(t, confirm.error)}</ErrorMessage>
        <PrimaryButton
          loading={confirm.isPending}
          disabled={confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          {t('authLinks.email_change.submit')}
        </PrimaryButton>
      </div>
    </PublicShell>
  );
}
