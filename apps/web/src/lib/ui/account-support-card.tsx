import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  changeSupportEmail,
  createSupportLink,
  resendSupport,
  type SupportLink,
} from '../account-support';
import { errorMessage } from '../errors';
import { formatDateTime } from '../format';
import { Badge, Button, Dialog, ErrorMessage, PrimaryButton, TextField } from '.';
import { useToast } from './toast';

export interface SupportTarget {
  id: string;
  fullName: string;
  email: string | null;
  pending: boolean;
  emailVerified: boolean;
  status: 'active' | 'locked' | 'removed';
}

/**
 * Thẻ "Kích hoạt và email" (ADR-0009, 7d-1): hiện trạng thái kích hoạt và xác thực email, ba việc khi thư không tới
 * (Gửi lại, Sửa email, Liên kết hỗ trợ). Dùng cho Quản trị viên; Người ra đề (7d-2) dùng lại thẻ này.
 */
export function AccountSupportCard({
  target,
  invalidateKeys,
}: {
  target: SupportTarget;
  invalidateKeys: readonly (readonly unknown[])[];
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'email' | 'link' | null>(null);
  const refresh = () =>
    Promise.all(invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const resend = useMutation({
    mutationFn: () => resendSupport(target.id),
    onSuccess: async () => {
      toast(t('accountSupport.resent'));
      await refresh();
    },
  });

  const locked = target.status !== 'active';
  const nothingToResend = !target.email || (!target.pending && target.emailVerified);
  const state = target.pending
    ? 'pending'
    : target.emailVerified
      ? 'active_verified'
      : 'active_unverified';

  return (
    <section
      aria-labelledby={`support-heading-${target.id}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 id={`support-heading-${target.id}`} className="text-base font-semibold">
        {t('accountSupport.heading')}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={state === 'active_verified' ? 'success' : 'warning'}>
          {t(`accountSupport.state.${state}`)}
        </Badge>
      </div>
      <p className="break-all text-sm text-fg-muted">
        {target.email ?? t('accountSupport.noEmail')}
      </p>
      {locked && <p className="text-sm text-fg-muted">{t('accountSupport.lockedHint')}</p>}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={locked || nothingToResend || resend.isPending}
          onClick={() => resend.mutate()}
        >
          {target.pending ? t('accountSupport.resendActivation') : t('accountSupport.resendVerify')}
        </Button>
        <Button type="button" disabled={locked} onClick={() => setDialog('email')}>
          {t('accountSupport.changeEmail')}
        </Button>
        <Button type="button" disabled={locked} onClick={() => setDialog('link')}>
          {t('accountSupport.createLink')}
        </Button>
      </div>
      <ErrorMessage>{resend.isError && errorMessage(t, resend.error)}</ErrorMessage>

      {dialog === 'email' && (
        <ChangeEmailDialog
          target={target}
          onClose={() => setDialog(null)}
          onDone={async () => {
            setDialog(null);
            toast(t('accountSupport.emailChanged'));
            await refresh();
          }}
        />
      )}
      {dialog === 'link' && (
        <SupportLinkDialog target={target} onClose={() => setDialog(null)} onDone={refresh} />
      )}
    </section>
  );
}

function ChangeEmailDialog({
  target,
  onClose,
  onDone,
}: {
  target: SupportTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => changeSupportEmail(target.id, { email: email.trim(), reason: reason.trim() }),
    onSuccess: onDone,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('accountSupport.changeEmailTitle', { name: target.fullName })}
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <p className="text-sm text-fg-muted">
          {target.pending
            ? t('accountSupport.changeEmailPendingHint')
            : t('accountSupport.changeEmailActiveHint')}
        </p>
        <TextField
          id="support-email"
          label={t('accountSupport.newEmail')}
          type="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          id="support-email-reason"
          label={t('accountSupport.reason')}
          hint={t('accountSupport.reasonHint')}
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        <PrimaryButton type="submit" disabled={mutation.isPending}>
          {t('accountSupport.changeEmailSubmit')}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

function SupportLinkDialog({
  target,
  onClose,
  onDone,
}: {
  target: SupportTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState('');
  // Liên kết chỉ nằm trong bộ nhớ của hộp thoại này; đóng hộp thoại là mất (máy chủ cũng không lưu).
  const [created, setCreated] = useState<SupportLink | null>(null);
  const mutation = useMutation({
    mutationFn: () => createSupportLink(target.id, { reason: reason.trim() }),
    onSuccess: (result) => {
      setCreated(result);
      onDone();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created?.link ?? '');
      toast(t('accountSupport.copied'));
    } catch {
      toast(t('accountSupport.copyFailed'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('accountSupport.createLinkTitle', { name: target.fullName })}
    >
      {created ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t(`accountSupport.linkIntro.${created.purpose}`, {
              time: formatDateTime(created.expiresAt),
            })}
          </p>
          <input
            readOnly
            aria-label={t('accountSupport.linkLabel')}
            value={created.link}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-12 w-full rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <Button type="button" onClick={copy}>
            {t('accountSupport.copy')}
          </Button>
          <p role="note" className="text-sm text-fg-muted">
            {t('accountSupport.linkOnce')}
          </p>
          <PrimaryButton type="button" onClick={onClose}>
            {t('common.close')}
          </PrimaryButton>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <p className="text-sm text-fg-muted">
            {target.pending
              ? t('accountSupport.createLinkPendingHint')
              : t('accountSupport.createLinkActiveHint')}
          </p>
          <TextField
            id="support-link-reason"
            label={t('accountSupport.reason')}
            hint={t('accountSupport.reasonHint')}
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
          <PrimaryButton type="submit" disabled={mutation.isPending}>
            {t('accountSupport.createLinkSubmit')}
          </PrimaryButton>
        </form>
      )}
    </Dialog>
  );
}
