import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, History, KeyRound, Lock, LockOpen, ScrollText, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACADEMIC_DEGREES,
  ACADEMIC_TITLES,
  type AcademicDegree,
  type AcademicTitle,
  GENDERS,
  type Gender,
  lockUser,
  ROLE_TAGS,
  reissueTemporaryPassword,
  removeUser,
  setRoleTag,
  type TemporaryPassword,
  type UserDetail,
  type UserUpdate,
  unitsQuery,
  unlockUser,
  updateUser,
  userQuery,
} from '../../../../lib/admin';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import {
  Button,
  Card,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  SelectField,
  TextField,
} from '../../../../lib/ui';
import { StatusBadge, TemporaryPasswordDialog } from '../../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/admin/users/$userId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(userQuery(params.userId)),
  component: UserDetailPage,
});

function UserDetailPage() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const { me } = Route.useRouteContext();
  const { data: user } = useSuspenseQuery(userQuery(userId));
  const editable = user.status !== 'removed';
  const isSelf = user.id === me.id;

  return (
    <section className="flex flex-col gap-5">
      <Link
        to="/admin/users"
        className="inline-flex min-h-12 w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('admin.users.backToList')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{user.fullName}</h1>
        <StatusBadge status={user.status} />
      </header>
      {user.status === 'locked' && user.lockedReason && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t('admin.users.lockedBecause', {
            reason: user.lockedReason,
            time: formatDateTime(user.lockedAt),
          })}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <ProfileForm user={user} editable={editable} />
          {!user.isAdmin && editable && <RoleTagsCard user={user} />}
          {user.roleTags.includes('examiner') && editable && <ExaminerProfileForm user={user} />}
        </div>
        <aside className="flex flex-col gap-5">
          <AccountCard user={user} />
          {editable && !isSelf && <ActionsCard user={user} />}
        </aside>
      </div>
    </section>
  );
}

function useUserMutation<T>(userId: string, mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      await queryClient.invalidateQueries({ queryKey: userQuery(userId).queryKey });
    },
  });
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Chỉ gửi các trường đã thay đổi; chuỗi rỗng nghĩa là bỏ trống. */
function changedFields(user: UserDetail, form: Record<string, string>): UserUpdate {
  const result: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(form)) {
    const value = key === 'fullName' ? raw.trim() : raw.trim() || null;
    if (value !== (user[key as keyof UserDetail] ?? null)) result[key] = value;
  }
  return result as UserUpdate;
}

function ProfileForm({ user, editable }: { user: UserDetail; editable: boolean }) {
  const { t } = useTranslation();
  const initial = {
    fullName: user.fullName,
    username: user.username ?? '',
    email: user.email ?? '',
    ...(user.isAdmin
      ? {}
      : {
          code: user.code ?? '',
          classLabel: user.classLabel ?? '',
          dateOfBirth: user.dateOfBirth ?? '',
          gender: user.gender ?? '',
        }),
  };
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState(false);
  const mutation = useUserMutation(user.id, (body: UserUpdate) => updateUser(user.id, body));
  const changes = changedFields(user, form);
  const set = (key: string) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm({ ...form, [key]: e.target.value });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(changes, { onSuccess: () => setSaved(true) });
  };

  return (
    <SectionCard title={t('admin.users.profile')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField
              id="full-name"
              label={t('admin.users.fullName')}
              required
              value={form.fullName}
              onChange={set('fullName')}
            />
          </div>
          <TextField
            id="username"
            label={t('admin.users.username')}
            autoCapitalize="none"
            value={form.username}
            onChange={set('username')}
          />
          <TextField
            id="email"
            label={t('admin.users.email')}
            type="email"
            value={form.email}
            onChange={set('email')}
          />
          {!user.isAdmin && (
            <>
              <TextField
                id="code"
                label={t('admin.users.code')}
                value={form.code}
                onChange={set('code')}
              />
              <TextField
                id="class-label"
                label={t('admin.users.classLabel')}
                value={form.classLabel}
                onChange={set('classLabel')}
              />
              <TextField
                id="date-of-birth"
                label={t('admin.users.dateOfBirth')}
                type="date"
                value={form.dateOfBirth}
                onChange={set('dateOfBirth')}
              />
              <SelectField
                id="gender"
                label={t('admin.users.gender')}
                value={form.gender}
                onChange={set('gender')}
              >
                <option value="">{t('common.notSet')}</option>
                {GENDERS.map((g: Gender) => (
                  <option key={g} value={g}>
                    {t(`gender.${g}`)}
                  </option>
                ))}
              </SelectField>
            </>
          )}
        </fieldset>
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        {saved && (
          <p role="status" className="text-sm text-success">
            {t('common.saved')}
          </p>
        )}
        {editable && (
          <PrimaryButton
            type="submit"
            className="sm:w-fit"
            disabled={mutation.isPending || Object.keys(changes).length === 0}
          >
            {t('common.save')}
          </PrimaryButton>
        )}
      </form>
    </SectionCard>
  );
}

function RoleTagsCard({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const mutation = useUserMutation(
    user.id,
    ({ tag, granted }: { tag: (typeof ROLE_TAGS)[number]; granted: boolean }) =>
      setRoleTag(user.id, tag, granted),
  );
  return (
    <SectionCard title={t('admin.users.roleTags')}>
      <fieldset className="flex flex-col gap-2" disabled={mutation.isPending}>
        <legend className="sr-only">{t('admin.users.roleTags')}</legend>
        {ROLE_TAGS.map((tag) => (
          <label
            key={tag}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 has-checked:border-primary has-checked:bg-primary-soft"
          >
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={user.roleTags.includes(tag)}
              onChange={(e) => mutation.mutate({ tag, granted: e.target.checked })}
            />
            <span className="font-medium">{t(`roleTag.${tag}`)}</span>
          </label>
        ))}
      </fieldset>
      {user.roleTags.length === 0 && (
        <p className="mt-2 text-sm text-warning">{t('admin.users.noRoleTagWarning')}</p>
      )}
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
    </SectionCard>
  );
}

function ExaminerProfileForm({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const units = useQuery(unitsQuery);
  const profile = user.examinerProfile;
  const [form, setForm] = useState({
    academicDegree: profile?.academicDegree ?? '',
    academicTitle: profile?.academicTitle ?? '',
    unitId: profile?.unitId ?? '',
  });
  const [saved, setSaved] = useState(false);
  const mutation = useUserMutation(user.id, () =>
    updateUser(user.id, {
      examinerProfile: {
        academicDegree: (form.academicDegree || null) as AcademicDegree | null,
        academicTitle: (form.academicTitle || null) as AcademicTitle | null,
        unitId: form.unitId || null,
      },
    }),
  );
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm({ ...form, [key]: e.target.value });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate(undefined, { onSuccess: () => setSaved(true) });
  };

  return (
    <SectionCard title={t('admin.users.examinerProfile')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="academic-degree"
            label={t('admin.users.academicDegree')}
            value={form.academicDegree}
            onChange={set('academicDegree')}
          >
            <option value="">{t('common.notSet')}</option>
            {ACADEMIC_DEGREES.map((d) => (
              <option key={d} value={d}>
                {t(`academicDegree.${d}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="academic-title"
            label={t('admin.users.academicTitle')}
            value={form.academicTitle}
            onChange={set('academicTitle')}
          >
            <option value="">{t('common.none')}</option>
            {ACADEMIC_TITLES.map((a) => (
              <option key={a} value={a}>
                {t(`academicTitle.${a}`)}
              </option>
            ))}
          </SelectField>
          <div className="sm:col-span-2">
            <SelectField
              id="unit"
              label={t('admin.users.unit')}
              value={form.unitId}
              onChange={set('unitId')}
            >
              <option value="">{t('common.notSet')}</option>
              {units.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        {saved && (
          <p role="status" className="text-sm text-success">
            {t('common.saved')}
          </p>
        )}
        <PrimaryButton type="submit" className="sm:w-fit" disabled={mutation.isPending}>
          {t('common.save')}
        </PrimaryButton>
      </form>
    </SectionCard>
  );
}

function AccountCard({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('admin.users.lastLoginAt'), formatDateTime(user.lastLoginAt) || t('common.never')],
    [t('admin.users.createdAt'), formatDateTime(user.createdAt)],
  ];
  if (user.mustChangePassword && user.passwordExpiresAt) {
    rows.push([t('admin.users.temporaryPasswordUntil'), formatDateTime(user.passwordExpiresAt)]);
  }
  return (
    <SectionCard title={t('admin.users.account')}>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-col gap-1">
        <Link
          to="/admin/login-events"
          search={{ userId: user.id }}
          className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-primary"
        >
          <History aria-hidden className="size-4" />
          {t('admin.nav.loginEvents')}
        </Link>
        <Link
          to="/admin/audit-logs"
          search={{ entityId: user.id }}
          className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-primary"
        >
          <ScrollText aria-hidden className="size-4" />
          {t('admin.nav.auditLogs')}
        </Link>
      </div>
    </SectionCard>
  );
}

type PendingAction = 'lock' | 'unlock' | 'password' | 'remove' | null;

function ActionsCard({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState<(TemporaryPassword & { title: string }) | null>(null);
  const close = () => {
    setPending(null);
    setReason('');
  };
  const mutation = useUserMutation(user.id, async (action: Exclude<PendingAction, null>) => {
    if (action === 'lock') return lockUser(user.id, reason.trim());
    if (action === 'unlock') return unlockUser(user.id, reason.trim());
    if (action === 'remove') return removeUser(user.id);
    const result = await reissueTemporaryPassword(user.id);
    setPassword({ ...result, title: t('admin.users.passwordReissued') });
    return result;
  });
  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (pending) mutation.mutate(pending, { onSuccess: close });
  };

  const dialog: Record<
    Exclude<PendingAction, null>,
    { title: string; body: string; cta: string }
  > = {
    lock: {
      title: t('admin.users.lockTitle', { name: user.fullName }),
      body: t('admin.users.lockBody'),
      cta: t('admin.users.lock'),
    },
    unlock: {
      title: t('admin.users.unlockTitle', { name: user.fullName }),
      body: t('admin.users.unlockBody'),
      cta: t('admin.users.unlock'),
    },
    password: {
      title: t('admin.users.reissueTitle', { name: user.fullName }),
      body: t('admin.users.reissueBody'),
      cta: t('admin.users.reissue'),
    },
    remove: {
      title: t('admin.users.removeTitle', { name: user.fullName }),
      body: t('admin.users.removeBody'),
      cta: t('admin.users.remove'),
    },
  };
  const current = pending ? dialog[pending] : null;

  return (
    <SectionCard title={t('admin.users.actions')}>
      <div className="flex flex-col gap-2">
        {user.status === 'locked' ? (
          <Button onClick={() => setPending('unlock')}>
            <LockOpen aria-hidden className="size-5" />
            {t('admin.users.unlock')}
          </Button>
        ) : (
          <Button onClick={() => setPending('lock')}>
            <Lock aria-hidden className="size-5" />
            {t('admin.users.lock')}
          </Button>
        )}
        <Button onClick={() => setPending('password')}>
          <KeyRound aria-hidden className="size-5" />
          {t('admin.users.reissue')}
        </Button>
        <Button variant="danger-ghost" onClick={() => setPending('remove')}>
          <Trash2 aria-hidden className="size-5" />
          {t('admin.users.remove')}
        </Button>
      </div>

      <Dialog open={current !== null} onClose={close} title={current?.title ?? ''}>
        {current && (
          <form className="flex flex-col gap-4" onSubmit={confirm}>
            <p className="text-fg-muted">{current.body}</p>
            {(pending === 'lock' || pending === 'unlock') && (
              <TextField
                id="action-reason"
                label={
                  pending === 'lock' ? t('admin.users.reason') : t('admin.users.reasonOptional')
                }
                required={pending === 'lock'}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={close}>{t('common.cancel')}</Button>
              <Button
                type="submit"
                variant={pending === 'lock' || pending === 'remove' ? 'danger' : 'primary'}
                disabled={mutation.isPending || (pending === 'lock' && reason.trim() === '')}
              >
                {current.cta}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <TemporaryPasswordDialog value={password} onClose={() => setPassword(null)} />
    </SectionCard>
  );
}
