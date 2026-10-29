import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACADEMIC_DEGREES,
  ACADEMIC_TITLES,
  type AcademicDegree,
  type AcademicTitle,
} from '../lib/admin';
import { ApiError } from '../lib/api';
import { logout, meQuery } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import {
  acceptInvitation,
  type InvitationPreview,
  invitationPreviewQuery,
} from '../lib/invitation';
import { Button, Card, ErrorMessage, PrimaryButton, SelectField, TextField } from '../lib/ui';
import { ListSkeleton } from '../lib/ui/admin';
import { ThemeSwitcher } from '../lib/ui/theme-switcher';

// Trang công khai: người được mời mở link, không cần đăng nhập để xem (Q81, Q86).
export const Route = createFileRoute('/invite/$token')({
  component: InvitePage,
});

function InvitePage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const invitation = useQuery(invitationPreviewQuery(token));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-primary">{t('app.title')}</p>
        <ThemeSwitcher />
      </div>
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t('invite.heading')}</h1>
        {invitation.isPending ? (
          <ListSkeleton rows={2} />
        ) : invitation.isError ? (
          <ErrorMessage>{errorMessage(t, invitation.error)}</ErrorMessage>
        ) : (
          <InviteContent token={token} invitation={invitation.data} />
        )}
      </Card>
    </main>
  );
}

function InviteContent({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const { t } = useTranslation();
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [degree, setDegree] = useState('');
  const [title, setTitle] = useState('');

  const accept = useMutation({
    mutationFn: () =>
      acceptInvitation(token, {
        password: invitation.accountExists ? undefined : password,
        academicDegree: (degree || null) as AcademicDegree | null,
        academicTitle: (title || null) as AcademicTitle | null,
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      await navigate({ to: '/' });
    },
  });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['auth'] });
      accept.reset();
    },
  });

  if (me.isPending) return <ListSkeleton rows={2} />;
  const signedIn = !!me.data;
  const mismatch = !invitation.accountExists && password !== confirmation && confirmation !== '';

  // Email đã có tài khoản mà chưa đăng nhập: phải đăng nhập đúng tài khoản đó (Q83).
  if (invitation.accountExists && !signedIn) {
    return (
      <div className="flex flex-col gap-4">
        <Intro invitation={invitation} />
        <p>{t('invite.existingNeedLogin', { email: invitation.email })}</p>
        <Link
          to="/login"
          search={{ redirect: `/invite/${token}` }}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 text-base font-semibold text-on-primary hover:bg-primary-hover"
        >
          {t('invite.login')}
        </Link>
      </div>
    );
  }

  const wrongAccount = accept.error instanceof ApiError && accept.error.code === 'FORBIDDEN';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mismatch) accept.mutate();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Intro invitation={invitation} />
      <p className="text-sm text-fg-muted">
        {invitation.accountExists ? t('invite.existingIntro') : t('invite.createIntro')}
      </p>
      {!invitation.accountExists && signedIn && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('invite.otherAccount')}
        </p>
      )}
      {!invitation.accountExists && (
        <>
          <TextField
            id="invite-password"
            label={t('invite.password')}
            hint={t('invite.passwordHint')}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            id="invite-password-confirm"
            label={t('invite.confirmPassword')}
            type="password"
            autoComplete="new-password"
            required
            error={mismatch ? t('invite.passwordMismatch') : undefined}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </>
      )}
      <SelectField
        id="invite-degree"
        label={t('invite.academicDegree')}
        value={degree}
        onChange={(e) => setDegree(e.target.value)}
      >
        <option value="">{t('common.notSet')}</option>
        {ACADEMIC_DEGREES.map((d) => (
          <option key={d} value={d}>
            {t(`academicDegree.${d}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="invite-title"
        label={t('invite.academicTitle')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      >
        <option value="">{t('common.none')}</option>
        {ACADEMIC_TITLES.map((a) => (
          <option key={a} value={a}>
            {t(`academicTitle.${a}`)}
          </option>
        ))}
      </SelectField>
      <ErrorMessage>
        {accept.isError &&
          (wrongAccount
            ? t('invite.wrongAccount', { email: invitation.email })
            : errorMessage(t, accept.error))}
      </ErrorMessage>
      {wrongAccount && (
        <Button disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          {t('invite.logout')}
        </Button>
      )}
      <PrimaryButton type="submit" disabled={accept.isPending || mismatch}>
        {invitation.accountExists ? t('invite.acceptSubmit') : t('invite.createSubmit')}
      </PrimaryButton>
    </form>
  );
}

function Intro({ invitation }: { invitation: InvitationPreview }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <p>{t('invite.intro', { name: invitation.fullName, unit: invitation.unitName ?? '' })}</p>
      <p className="text-sm text-fg-muted">
        {t('invite.email')}: <span className="font-medium text-fg">{invitation.email}</span>
      </p>
    </div>
  );
}
