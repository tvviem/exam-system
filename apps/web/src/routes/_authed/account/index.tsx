import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, MonitorSmartphone } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACADEMIC_DEGREES,
  ACADEMIC_TITLES,
  type Account,
  type AccountChanges,
  accountQuery,
  GENDERS,
  updateAccount,
} from '../../../lib/account';
import { errorMessage } from '../../../lib/errors';
import { Badge, Card, ErrorMessage, PrimaryButton, SelectField, TextField } from '../../../lib/ui';
import { AccountEmailCard } from '../../../lib/ui/account-email-card';
import { BackToTake } from '../../../lib/ui/back-to-take';
import { PageHeader } from '../../../lib/ui/page-header';
import { PasswordForm } from '../../../lib/ui/password-form';
import { useToast } from '../../../lib/ui/toast';

export const Route = createFileRoute('/_authed/account/')({
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation();
  const account = useQuery(accountQuery);
  const toast = useToast();

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4">
      <BackToTake />
      <PageHeader title={t('account.title')} />
      {account.isPending ? (
        <div className="h-48 animate-pulse rounded-xl border border-border bg-surface" />
      ) : account.isError ? (
        <ErrorMessage>{errorMessage(t, account.error)}</ErrorMessage>
      ) : (
        <>
          <ProfileCard account={account.data} />
          <AccountEmailCard account={account.data} />
        </>
      )}
      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">{t('changePassword.heading')}</h2>
        <p className="text-sm text-fg-muted">{t('account.passwordIntro')}</p>
        <PasswordForm onChanged={() => toast(t('changePassword.done'))} />
      </Card>
      <Link
        to="/account/auth-sessions"
        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface p-4 font-medium hover:border-border-strong"
      >
        <MonitorSmartphone aria-hidden className="size-5 text-fg-muted" />
        <span className="flex-1">{t('nav.authSessions')}</span>
        <ChevronRight aria-hidden className="size-5 text-fg-muted" />
      </Link>
    </section>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-sm text-fg-muted sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value || t('account.empty')}</dd>
    </div>
  );
}

function ProfileCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editable = (field: Account['editable'][number]) => account.editable.includes(field);
  const profile = account.examinerProfile;
  const initial = {
    fullName: account.fullName,
    dateOfBirth: account.dateOfBirth ?? '',
    gender: account.gender ?? '',
    academicDegree: profile?.academicDegree ?? '',
    academicTitle: profile?.academicTitle ?? '',
  };
  const [form, setForm] = useState(initial);
  // Nạp lại biểu mẫu khi dữ liệu từ server đổi (sau khi lưu).
  useEffect(() => {
    setForm({
      fullName: account.fullName,
      dateOfBirth: account.dateOfBirth ?? '',
      gender: account.gender ?? '',
      academicDegree: account.examinerProfile?.academicDegree ?? '',
      academicTitle: account.examinerProfile?.academicTitle ?? '',
    });
  }, [account]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () => {
      const changes: AccountChanges = {};
      if (editable('fullName')) changes.fullName = form.fullName.trim();
      if (editable('dateOfBirth')) changes.dateOfBirth = form.dateOfBirth || null;
      if (editable('gender')) changes.gender = (form.gender || null) as Account['gender'];
      if (editable('academicDegree')) {
        changes.academicDegree = (form.academicDegree || null) as AccountChanges['academicDegree'];
      }
      if (editable('academicTitle')) {
        changes.academicTitle = (form.academicTitle || null) as AccountChanges['academicTitle'];
      }
      return updateAccount(changes);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(accountQuery.queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast(t('account.saved'));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dirty) save.mutate();
  };

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-base font-semibold">{t('account.profile')}</h2>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {editable('fullName') ? (
          <TextField
            id="account-full-name"
            label={t('account.fullName')}
            required
            maxLength={200}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {editable('dateOfBirth') && (
            <TextField
              id="account-dob"
              label={t('account.dateOfBirth')}
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          )}
          {editable('gender') && (
            <SelectField
              id="account-gender"
              label={t('account.gender')}
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">{t('account.notSpecified')}</option>
              {GENDERS.map((value) => (
                <option key={value} value={value}>
                  {t(`gender.${value}`)}
                </option>
              ))}
            </SelectField>
          )}
          {editable('academicDegree') && (
            <SelectField
              id="account-degree"
              label={t('account.academicDegree')}
              value={form.academicDegree}
              onChange={(e) => setForm({ ...form, academicDegree: e.target.value })}
            >
              <option value="">{t('account.notSpecified')}</option>
              {ACADEMIC_DEGREES.map((value) => (
                <option key={value} value={value}>
                  {t(`academicDegree.${value}`)}
                </option>
              ))}
            </SelectField>
          )}
          {editable('academicTitle') && (
            <SelectField
              id="account-title"
              label={t('account.academicTitle')}
              value={form.academicTitle}
              onChange={(e) => setForm({ ...form, academicTitle: e.target.value })}
            >
              <option value="">{t('account.notSpecified')}</option>
              {ACADEMIC_TITLES.map((value) => (
                <option key={value} value={value}>
                  {t(`academicTitle.${value}`)}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <ErrorMessage>{save.isError && errorMessage(t, save.error)}</ErrorMessage>
        <div>
          <PrimaryButton loading={save.isPending} type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? t('account.saving') : t('account.save')}
          </PrimaryButton>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg-muted">{t('account.managedByAdmin')}</h3>
        <dl className="flex flex-col gap-3">
          <ReadOnlyRow label={t('account.username')} value={account.username} />
          <ReadOnlyRow label={t('account.email')} value={account.email} />
          {account.code && <ReadOnlyRow label={t('account.code')} value={account.code} />}
          {account.classLabel && (
            <ReadOnlyRow label={t('account.classLabel')} value={account.classLabel} />
          )}
          {profile && <ReadOnlyRow label={t('account.unit')} value={profile.unitName} />}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
            <dt className="text-sm text-fg-muted sm:w-40 sm:shrink-0">{t('account.roles')}</dt>
            <dd className="flex flex-wrap gap-1">
              {account.isAdmin ? (
                <Badge tone="primary">{t('roleTag.admin')}</Badge>
              ) : (
                account.roleTags.map((tag) => <Badge key={tag}>{t(`roleTag.${tag}`)}</Badge>)
              )}
            </dd>
          </div>
        </dl>
        <p className="text-sm text-fg-muted">{t('account.managedHint')}</p>
      </div>
    </Card>
  );
}
