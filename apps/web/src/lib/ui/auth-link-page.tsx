import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  consumeLink,
  type EmailConfirmState,
  type LinkPurpose,
  type LinkState,
  linkStatus,
  type PasswordPurpose,
  useLinkToken,
} from '../auth-links';
import { errorMessage } from '../errors';
import { formatWhen } from '../format';
import { buttonClass, Card, ErrorMessage, PrimaryButton, TextField } from '.';
import { ListSkeleton } from './admin';
import { BrandMark } from './brand';
import { ThemeSwitcher } from './theme-switcher';

/** Khung trang công khai (cùng kiểu trang đăng nhập): dấu thương hiệu, đổi giao diện, một thẻ nội dung. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <BrandMark className="text-sm" />
        <ThemeSwitcher />
      </div>
      <Card>{children}</Card>
    </main>
  );
}

/**
 * Trang dùng Liên kết một lần (kích hoạt, đặt lại mật khẩu): đọc mã từ mảnh `#`, xem mã còn dùng được không TRƯỚC khi
 * người dùng gõ mật khẩu, nêu rõ lý do và việc làm tiếp khi không dùng được. Không tự đăng nhập sau khi xong (OWASP).
 */
export function AuthLinkPage({ purpose }: { purpose: PasswordPurpose }) {
  const token = useLinkToken();
  // `key` theo mã: dán liên kết khác vào cùng tab thì dựng lại từ đầu.
  return <AuthLinkContent key={token} purpose={purpose} token={token} />;
}

function AuthLinkContent({ purpose, token }: { purpose: PasswordPurpose; token: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<LinkState | null>(null);

  const status = useQuery({
    queryKey: ['auth-link', purpose, token],
    queryFn: () => linkStatus(purpose, token),
    enabled: token !== '',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (done) return <Done purpose={purpose} />;
  if (token === '') return <Problem purpose={purpose} link={{ state: 'unknown' }} />;
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
  const link = problem ?? status.data;
  if (link.state !== 'ok') return <Problem purpose={purpose} link={link} />;
  return (
    <PasswordStep
      purpose={purpose}
      token={token}
      onDone={() => setDone(true)}
      onProblem={setProblem}
    />
  );
}

function PasswordStep({
  purpose,
  token,
  onDone,
  onProblem,
}: {
  purpose: PasswordPurpose;
  token: string;
  onDone: () => void;
  onProblem: (link: LinkState) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = confirmation !== '' && password !== confirmation;

  const mutation = useMutation({
    mutationFn: () => consumeLink(purpose, token, password),
    onSuccess: (result) => {
      if (result.state === 'ok') onDone();
      else onProblem(result);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mismatch) mutation.mutate();
  };

  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">{t(`authLinks.${purpose}.heading`)}</h1>
      <p className="mb-5 text-sm text-fg-muted">{t(`authLinks.${purpose}.intro`)}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          id="link-password"
          label={t('authLinks.password')}
          hint={t('authLinks.passwordHint')}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          id="link-password-confirm"
          label={t('authLinks.confirm')}
          type="password"
          autoComplete="new-password"
          required
          error={mismatch ? t('authLinks.mismatch') : undefined}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        <PrimaryButton loading={mutation.isPending} type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? t('authLinks.submitting') : t(`authLinks.${purpose}.submit`)}
        </PrimaryButton>
      </form>
    </PublicShell>
  );
}

function Done({ purpose }: { purpose: PasswordPurpose }) {
  const { t } = useTranslation();
  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">{t(`authLinks.${purpose}.doneHeading`)}</h1>
      <p className="mb-5 text-sm text-fg-muted">{t('authLinks.doneText')}</p>
      <Link to="/login" search={{ redirect: undefined }} className={buttonClass('primary')}>
        {t('authLinks.login')}
      </Link>
    </PublicShell>
  );
}

export type ProblemState = Exclude<EmailConfirmState, { state: 'ok' }>;

/** Một trang riêng cho mỗi lý do không dùng được: nêu lý do, giờ liên quan và việc làm tiếp (không bắt người dùng đoán). */
export function Problem({ purpose, link }: { purpose: LinkPurpose; link: ProblemState }) {
  const { t } = useTranslation();
  const when =
    link.state === 'expired'
      ? formatWhen(link.expiredAt)
      : link.state === 'used'
        ? formatWhen(link.usedAt)
        : '';
  const emailChange = purpose === 'email_change';
  const wantsLogin = !emailChange && link.state === 'used';
  const needsNewLink =
    !emailChange &&
    (link.state === 'expired' || link.state === 'unknown' || link.state === 'replaced');
  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">
        {t(`authLinks.problem.${link.state}.heading`)}
      </h1>
      <p className="mb-5 text-sm text-fg-muted">
        {t(`authLinks.problem.${link.state}.text`, {
          when,
          purpose: t(`authLinks.${purpose}.name`),
        })}
      </p>
      <div className="flex flex-col gap-3">
        {wantsLogin && (
          <Link to="/login" search={{ redirect: undefined }} className={buttonClass('primary')}>
            {t('authLinks.login')}
          </Link>
        )}
        {needsNewLink && (
          <Link to="/forgot-password" className={buttonClass('primary')}>
            {t('authLinks.requestNew')}
          </Link>
        )}
        {emailChange && (
          <Link to="/account" className={buttonClass('primary')}>
            {t('authLinks.backToAccount')}
          </Link>
        )}
      </div>
    </PublicShell>
  );
}
