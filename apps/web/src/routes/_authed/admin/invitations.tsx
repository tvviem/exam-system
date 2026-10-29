import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Link2, Plus, RefreshCw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createInvitation,
  INVITATION_STATUSES,
  type Invitation,
  type InvitationLink,
  type InvitationParams,
  type InvitationStatus,
  invitationsQuery,
  invitationUrl,
  regenerateInvitation,
  revokeInvitation,
  unitsQuery,
} from '../../../lib/admin';
import { ApiError } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  SelectField,
  TextField,
} from '../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination, ShowOnceDialog } from '../../../lib/ui/admin';
import { useToast } from '../../../lib/ui/toast';

export const Route = createFileRoute('/_authed/admin/invitations')({
  validateSearch: (search: Record<string, unknown>): InvitationParams => ({
    status: INVITATION_STATUSES.includes(search.status as InvitationStatus)
      ? (search.status as InvitationStatus)
      : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: InvitationsPage,
});

const statusTone = {
  pending: 'primary',
  accepted: 'success',
  expired: 'warning',
  revoked: 'neutral',
} as const;

type LinkValue = InvitationLink & { title: string };

function InvitationsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const invitations = useQuery(invitationsQuery(search));
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<LinkValue | null>(null);
  // Lời mời đang chờ xác nhận Thu hồi / Tạo lại link.
  const [confirm, setConfirm] = useState<{
    kind: 'revoke' | 'regenerate';
    item: Invitation;
  } | null>(null);
  const showLink = (value: InvitationLink) =>
    setLink({ ...value, title: t('admin.invitations.linkTitle', { name: value.fullName }) });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('admin.invitations.heading')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="size-5" />
          {t('admin.invitations.add')}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{t('admin.invitations.intro')}</p>
      <div className="sm:w-64">
        <SelectField
          id="filter-invitation-status"
          label={t('admin.invitations.status')}
          value={search.status ?? ''}
          onChange={(e) =>
            navigate({
              search: (s) => ({
                ...s,
                status: (e.target.value || undefined) as InvitationStatus | undefined,
                page: undefined,
              }),
            })
          }
        >
          <option value="">{t('admin.invitations.allStatuses')}</option>
          {INVITATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`invitationStatus.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {invitations.isPending ? (
        <ListSkeleton />
      ) : invitations.isError ? (
        <ErrorMessage>{errorMessage(t, invitations.error)}</ErrorMessage>
      ) : invitations.data.items.length === 0 ? (
        <EmptyState>{t('admin.invitations.empty')}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {invitations.data.items.map((item) => (
              <InvitationRow
                key={item.id}
                item={item}
                onRevoke={() => setConfirm({ kind: 'revoke', item })}
                onRegenerate={() => setConfirm({ kind: 'regenerate', item })}
              />
            ))}
          </ul>
          <Pagination
            page={invitations.data.page}
            pageSize={invitations.data.pageSize}
            total={invitations.data.total}
            onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
          />
        </>
      )}

      {creating && (
        <CreateInvitationDialog
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            showLink(created);
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          onClose={() => setConfirm(null)}
          onRegenerated={(regenerated) => {
            setConfirm(null);
            showLink(regenerated);
          }}
        />
      )}
      <InvitationLinkDialog value={link} onClose={() => setLink(null)} />
    </section>
  );
}

function InvitationRow({
  item,
  onRevoke,
  onRegenerate,
}: {
  item: Invitation;
  onRevoke: () => void;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.fullName}</span>
          <Badge tone={statusTone[item.status]}>{t(`invitationStatus.${item.status}`)}</Badge>
        </p>
        <p className="truncate text-sm text-fg-muted">
          {item.email} · {item.unitName}
        </p>
        <p className="text-sm text-fg-muted tabular-nums">
          {item.status === 'accepted'
            ? t('admin.invitations.accepted', { time: formatDateTime(item.acceptedAt) })
            : t('admin.invitations.expires', { time: formatDateTime(item.expiresAt) })}
          {' · '}
          {t('admin.invitations.invitedBy', { name: item.invitedByName })}
        </p>
      </div>
      {(item.status === 'pending' || item.status === 'expired') && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRegenerate}>
            <RefreshCw aria-hidden className="size-5" />
            {t('admin.invitations.regenerate')}
          </Button>
          {item.status === 'pending' && (
            <Button variant="danger-ghost" onClick={onRevoke}>
              {t('admin.invitations.revoke')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function CreateInvitationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (link: InvitationLink) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const units = useQuery(unitsQuery);
  const [form, setForm] = useState({ email: '', fullName: '', unitId: '' });
  const mutation = useMutation({
    mutationFn: () =>
      createInvitation({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        unitId: form.unitId,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      onCreated(created);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const emailTaken =
    mutation.error instanceof ApiError &&
    mutation.error.code === 'CONFLICT' &&
    mutation.error.details.field === 'email';

  return (
    <Dialog open onClose={onClose} title={t('admin.invitations.add')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          id="invitation-full-name"
          label={t('admin.invitations.fullName')}
          required
          maxLength={200}
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <TextField
          id="invitation-email"
          label={t('admin.invitations.email')}
          type="email"
          autoCapitalize="none"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <SelectField
          id="invitation-unit"
          label={t('admin.invitations.unit')}
          required
          value={form.unitId}
          onChange={(e) => setForm({ ...form, unitId: e.target.value })}
          hint={units.data?.length === 0 ? t('admin.invitations.noUnits') : undefined}
        >
          <option value="">{t('admin.invitations.unitPlaceholder')}</option>
          {units.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.code} · {u.name}
            </option>
          ))}
        </SelectField>
        <ErrorMessage>
          {mutation.isError &&
            (emailTaken ? t('errors.CONFLICT_email_invitation') : errorMessage(t, mutation.error))}
        </ErrorMessage>
        <PrimaryButton type="submit" disabled={mutation.isPending}>
          {t('admin.invitations.createSubmit')}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}

function ConfirmDialog({
  kind,
  item,
  onClose,
  onRegenerated,
}: {
  kind: 'revoke' | 'regenerate';
  item: Invitation;
  onClose: () => void;
  onRegenerated: (link: InvitationLink) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    // Chỉ Tạo lại link trả link mới; Thu hồi trả null.
    mutationFn: async (): Promise<InvitationLink | null> => {
      if (kind === 'regenerate') return regenerateInvitation(item.id);
      await revokeInvitation(item.id);
      return null;
    },
    onSuccess: async (regenerated) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      if (regenerated) onRegenerated(regenerated);
      else {
        toast(t('toast.invitationRevoked'));
        onClose();
      }
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`admin.invitations.${kind}Title`, { name: item.fullName })}
    >
      <p className="text-sm text-fg-muted">
        {t(`admin.invitations.${kind}Confirm`, { name: item.fullName })}
      </p>
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          variant={kind === 'revoke' ? 'danger' : 'primary'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t(`admin.invitations.${kind}`)}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}

function InvitationLinkDialog({
  value,
  onClose,
}: {
  value: LinkValue | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!value) return null;
  const url = invitationUrl(value.token);
  return (
    <ShowOnceDialog
      title={value.title}
      warning={t('admin.invitations.linkOnlyOnce')}
      copyLabel={t('admin.invitations.copyLink')}
      note={t('admin.invitations.linkExpires', { time: formatDateTime(value.expiresAt) })}
      confirmLabel={t('admin.invitations.linkSaved')}
      testId="invitation-link"
      display={
        <>
          <Link2 aria-hidden className="size-4 shrink-0 text-fg-muted" />
          <span className="text-sm">{url}</span>
        </>
      }
      copyText={url}
      onClose={onClose}
    />
  );
}
