import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  CircleX,
  Hourglass,
  UserRoundCheck,
  UserRoundPlus,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccountRequestItem,
  type AccountRequestStatus,
  accountRequestItemsQuery,
  accountRequestQuery,
  MATCH_STATUSES,
  type MatchStatus,
  rejectAccountRequest,
} from '../account-requests';
import { errorMessage } from '../errors';
import { formatDate, formatDateTime } from '../format';
import { Badge, Button, Dialog, ErrorMessage } from '.';
import { EmptyState, ListSkeleton, Pagination } from './admin';

const statusTone = {
  parsing: 'neutral',
  parse_failed: 'danger',
  pending: 'primary',
  approving: 'neutral',
  approved: 'success',
  partially_approved: 'warning',
  rejected: 'danger',
} as const;

/** Trạng thái luôn kèm chữ và biểu tượng, không chỉ dựa vào màu. */
export function RequestStatusBadge({ status }: { status: AccountRequestStatus }) {
  const { t } = useTranslation();
  const icon =
    status === 'approved' ? (
      <CircleCheck aria-hidden className="size-3" />
    ) : status === 'rejected' || status === 'parse_failed' ? (
      <CircleX aria-hidden className="size-3" />
    ) : (
      <Hourglass aria-hidden className="size-3" />
    );
  return (
    <Badge tone={statusTone[status]} icon={icon}>
      {t(`accountRequestStatus.${status}`)}
    </Badge>
  );
}

const matchTone = {
  new: 'primary',
  exact: 'success',
  name_mismatch: 'warning',
  blocked: 'danger',
} as const;

export function MatchBadge({ status }: { status: MatchStatus }) {
  const { t } = useTranslation();
  const icon =
    status === 'new' ? (
      <UserRoundPlus aria-hidden className="size-3" />
    ) : status === 'exact' ? (
      <UserRoundCheck aria-hidden className="size-3" />
    ) : status === 'blocked' ? (
      <Ban aria-hidden className="size-3" />
    ) : (
      <Hourglass aria-hidden className="size-3" />
    );
  return (
    <Badge tone={matchTone[status]} icon={icon}>
      {t(`matchStatus.${status}`)}
    </Badge>
  );
}

/** Chi tiết một yêu cầu, dùng chung cho Người ra đề và Quản trị viên (Quản trị viên có thêm Từ chối). */
export function AccountRequestView({ id, admin }: { id: string; admin: boolean }) {
  const { t } = useTranslation();
  const request = useQuery(accountRequestQuery(id));
  const [matchStatus, setMatchStatus] = useState<MatchStatus | undefined>();
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState(false);
  const data = request.data;
  const items = useQuery({
    ...accountRequestItemsQuery(
      id,
      { matchStatus, page: page > 1 ? page : undefined },
      data?.status,
    ),
    enabled: !!data && data.status !== 'parsing' && data.status !== 'parse_failed',
  });

  const backTo = admin ? '/admin/account-requests' : '/examiner/account-requests';
  return (
    <section className="flex flex-col gap-4">
      <Link
        to={backTo}
        className="inline-flex min-h-12 w-fit items-center gap-1 text-sm font-medium text-primary"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('accountRequests.back')}
      </Link>

      {request.isPending ? (
        <ListSkeleton rows={2} />
      ) : request.isError ? (
        <ErrorMessage>{errorMessage(t, request.error)}</ErrorMessage>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold break-all">{request.data.originalFilename}</h1>
              <RequestStatusBadge status={request.data.status} />
            </div>
            <p className="text-sm text-fg-muted">
              {t('accountRequests.sentBy', { name: request.data.requesterName })} ·{' '}
              {t('accountRequests.sentAt', { time: formatDateTime(request.data.createdAt) })}
              {request.data.rowCount !== null &&
                ` · ${t('accountRequests.rows', { count: request.data.rowCount })}`}
            </p>
            {request.data.note && (
              <p className="text-sm">
                <span className="text-fg-muted">{t('accountRequests.noteLabel')}: </span>
                {request.data.note}
              </p>
            )}
          </header>

          {request.data.status === 'parsing' && (
            <p
              role="status"
              className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
            >
              {t('accountRequests.parsingHint')}
            </p>
          )}
          {request.data.status === 'parse_failed' && (
            <ErrorMessage>
              {t(`accountRequestFileError.${request.data.parseError}`, {
                defaultValue: t('errors.UNKNOWN'),
              })}
            </ErrorMessage>
          )}
          {request.data.reviewedAt && (
            <p className="rounded-lg bg-bg px-3 py-2 text-sm">
              {t('accountRequests.reviewedBy', {
                name: request.data.reviewedByName,
                time: formatDateTime(request.data.reviewedAt),
              })}
              {request.data.reviewNote && (
                <>
                  <br />
                  <span className="text-fg-muted">{t('accountRequests.reviewNote')}: </span>
                  {request.data.reviewNote}
                </>
              )}
            </p>
          )}

          {admin && request.data.status === 'pending' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="danger-ghost" onClick={() => setRejecting(true)}>
                {t('accountRequests.reject')}
              </Button>
              <p className="text-sm text-fg-muted">{t('accountRequests.approveSoon')}</p>
            </div>
          )}

          {data && data.status !== 'parsing' && data.status !== 'parse_failed' && (
            <>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1 text-sm font-medium">
                  {t('accountRequests.filterRows')}
                </legend>
                <FilterButton
                  active={!matchStatus}
                  onClick={() => {
                    setMatchStatus(undefined);
                    setPage(1);
                  }}
                >
                  {t('accountRequests.allRows', { count: data.rowCount ?? 0 })}
                </FilterButton>
                {MATCH_STATUSES.map((status) => (
                  <FilterButton
                    key={status}
                    active={matchStatus === status}
                    onClick={() => {
                      setMatchStatus(status);
                      setPage(1);
                    }}
                  >
                    {t(`matchStatus.${status}`)} ({data.counts[status]})
                  </FilterButton>
                ))}
              </fieldset>

              {items.isPending ? (
                <ListSkeleton />
              ) : items.isError ? (
                <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>
              ) : items.data.items.length === 0 ? (
                <EmptyState>{t('accountRequests.itemsEmpty')}</EmptyState>
              ) : (
                <>
                  <ItemCards items={items.data.items} admin={admin} />
                  <ItemTable items={items.data.items} admin={admin} />
                  <Pagination
                    page={items.data.page}
                    pageSize={items.data.pageSize}
                    total={items.data.total}
                    onPage={setPage}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      {rejecting && <RejectDialog id={id} onClose={() => setRejecting(false)} />}
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-12 cursor-pointer items-center rounded-lg border px-3 text-sm font-medium ${
        active
          ? 'border-primary bg-primary-soft text-on-primary-soft'
          : 'border-border-strong bg-surface text-fg hover:bg-primary-soft'
      }`}
    >
      {children}
    </button>
  );
}

/** Lý do dòng không duyệt được, hoặc ghi chú kết quả. */
function itemNote(item: AccountRequestItem, t: TFunction) {
  return item.outcomeNote
    ? t(`accountRequestRowError.${item.outcomeNote}`, { defaultValue: item.outcomeNote })
    : t(`matchStatusHint.${item.matchStatus}`);
}

const identityOf = (item: AccountRequestItem) =>
  [item.code, item.email].filter(Boolean).join(' · ');

function MatchedUser({ item, admin }: { item: AccountRequestItem; admin: boolean }) {
  const { t } = useTranslation();
  if (!item.matchedUser) return null;
  return (
    <p className="text-sm text-fg-muted">
      {t('accountRequests.matchedAccount')}:{' '}
      {admin ? (
        <Link
          to="/admin/users/$userId"
          params={{ userId: item.matchedUser.id }}
          className="text-primary hover:underline"
        >
          {item.matchedUser.fullName}
        </Link>
      ) : (
        item.matchedUser.fullName
      )}
    </p>
  );
}

function ItemCards({ items, admin }: { items: AccountRequestItem[]; admin: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-fg-muted">{t('accountRequests.row', { n: item.rowNumber })}</p>
          <p className="font-medium">{item.fullName ?? '—'}</p>
          <p className="text-sm text-fg-muted">
            {identityOf(item)}
            {item.classLabel && ` · ${item.classLabel}`}
            {item.dateOfBirth && ` · ${formatDate(item.dateOfBirth)}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MatchBadge status={item.matchStatus} />
            {item.outcome !== 'pending' && <Badge>{t(`itemOutcome.${item.outcome}`)}</Badge>}
          </div>
          <p className="mt-1 text-sm">{itemNote(item, t)}</p>
          <MatchedUser item={item} admin={admin} />
        </li>
      ))}
    </ul>
  );
}

function ItemTable({ items, admin }: { items: AccountRequestItem[]; admin: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-fg-muted">
          <tr>
            <th className="px-4 py-3 font-medium">{t('accountRequests.columns.row')}</th>
            <th className="px-4 py-3 font-medium">{t('accountRequests.columns.fullName')}</th>
            <th className="px-4 py-3 font-medium">{t('accountRequests.columns.identity')}</th>
            <th className="px-4 py-3 font-medium">{t('accountRequests.columns.classLabel')}</th>
            <th className="px-4 py-3 font-medium">{t('accountRequests.columns.match')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border align-top last:border-0">
              <td className="px-4 py-3 tabular-nums text-fg-muted">{item.rowNumber}</td>
              <td className="px-4 py-3 font-medium">{item.fullName ?? '—'}</td>
              <td className="px-4 py-3 text-fg-muted">{identityOf(item)}</td>
              <td className="px-4 py-3 text-fg-muted">{item.classLabel}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <MatchBadge status={item.matchStatus} />
                  {item.outcome !== 'pending' && <Badge>{t(`itemOutcome.${item.outcome}`)}</Badge>}
                </div>
                <p className="mt-1">{itemNote(item, t)}</p>
                <MatchedUser item={item} admin={admin} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RejectDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => rejectAccountRequest(id, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title={t('accountRequests.rejectTitle')}>
      <p className="text-sm text-fg-muted">{t('accountRequests.rejectIntro')}</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('accountRequests.rejectNote')}
        <textarea
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base font-normal text-fg outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </label>
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {t('accountRequests.rejectConfirm')}
        </Button>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
