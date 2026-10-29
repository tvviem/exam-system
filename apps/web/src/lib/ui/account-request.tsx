import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  CircleX,
  FileDown,
  FileSpreadsheet,
  Hourglass,
  UserRoundCheck,
  UserRoundPlus,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccountRequestItem,
  type AccountRequestItemParams,
  type AccountRequestStatus,
  type ApprovalSelection,
  accountRequestItemsQuery,
  accountRequestQuery,
  approveAccountRequest,
  credentialSlipsQuery,
  MATCH_STATUSES,
  type MatchStatus,
  rejectAccountRequest,
  slipUrl,
} from '../account-requests';
import { errorMessage } from '../errors';
import { formatDate, formatDateTime } from '../format';
import { Badge, Button, buttonClass, Dialog, ErrorMessage } from '.';
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
export function AccountRequestView({
  id,
  admin,
  filter,
  onFilterChange,
}: {
  id: string;
  admin: boolean;
  /** Bộ lọc và trang nằm trên URL (docs/ui-design.md mục 7) nên do route giữ. */
  filter: AccountRequestItemParams;
  onFilterChange: (next: AccountRequestItemParams) => void;
}) {
  const { t } = useTranslation();
  const request = useQuery(accountRequestQuery(id));
  const [rejecting, setRejecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const data = request.data;
  const reviewable = admin && data?.status === 'pending';
  const selection = reviewable
    ? {
        selected,
        toggle: (itemId: string) =>
          setSelected((current) => {
            const next = new Set(current);
            if (!next.delete(itemId)) next.add(itemId);
            return next;
          }),
      }
    : undefined;
  const { matchStatus } = filter;
  const items = useQuery({
    ...accountRequestItemsQuery(id, filter, data?.status),
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

          {request.data.status === 'approving' && (
            <p
              role="status"
              className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
            >
              {t('accountRequests.approvingHint')}
            </p>
          )}

          {reviewable && (
            <ReviewBar
              id={id}
              pendingValid={request.data.pendingValid}
              selected={selected}
              onDone={() => setSelected(new Set())}
              onReject={() => setRejecting(true)}
            />
          )}

          <SlipsSection requestId={id} status={request.data.status} />

          {data && data.status !== 'parsing' && data.status !== 'parse_failed' && (
            <>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1 text-sm font-medium">
                  {t('accountRequests.filterRows')}
                </legend>
                <FilterButton active={!matchStatus} onClick={() => onFilterChange({})}>
                  {t('accountRequests.allRows', { count: data.rowCount ?? 0 })}
                </FilterButton>
                {MATCH_STATUSES.map((status) => (
                  <FilterButton
                    key={status}
                    active={matchStatus === status}
                    onClick={() => onFilterChange({ matchStatus: status })}
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
                  <ItemCards items={items.data.items} admin={admin} selection={selection} />
                  <ItemTable items={items.data.items} admin={admin} selection={selection} />
                  <Pagination
                    page={items.data.page}
                    pageSize={items.data.pageSize}
                    total={items.data.total}
                    onPage={(next) =>
                      onFilterChange({ matchStatus, page: next > 1 ? next : undefined })
                    }
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

interface ItemListProps {
  items: AccountRequestItem[];
  admin: boolean;
  /** Có khi Quản trị viên đang duyệt: cho chọn từng dòng. */
  selection?: { selected: Set<string>; toggle: (id: string) => void };
}

/** Ô chọn dòng; chỉ dòng còn chờ và không bị chặn mới chọn được. */
function RowCheckbox({
  item,
  selection,
}: {
  item: AccountRequestItem;
  selection: ItemListProps['selection'];
}) {
  const { t } = useTranslation();
  if (!selection || item.outcome !== 'pending' || item.matchStatus === 'blocked') return null;
  return (
    <label className="-m-2 inline-flex size-12 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        aria-label={t('accountRequests.selectRow', { n: item.rowNumber })}
        checked={selection.selected.has(item.id)}
        onChange={() => selection.toggle(item.id)}
      />
    </label>
  );
}

function ItemCards({ items, admin, selection }: ItemListProps) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {t('accountRequests.row', { n: item.rowNumber })}
            </p>
            <RowCheckbox item={item} selection={selection} />
          </div>
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

function ItemTable({ items, admin, selection }: ItemListProps) {
  const { t } = useTranslation();
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-fg-muted">
          <tr>
            {selection && <th className="w-12 px-2 py-3" />}
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
              {selection && (
                <td className="px-2 py-1">
                  <RowCheckbox item={item} selection={selection} />
                </td>
              )}
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

/** Thanh duyệt: duyệt cả lô hợp lệ, hoặc duyệt / từ chối các dòng đã chọn (Q91). */
function ReviewBar({
  id,
  pendingValid,
  selected,
  onDone,
  onReject,
}: {
  id: string;
  pendingValid: number;
  selected: Set<string>;
  onDone: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (selection: ApprovalSelection) => approveAccountRequest(id, selection),
    onSuccess: async () => {
      onDone();
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const chosen = [...selected];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          variant="primary"
          disabled={pendingValid === 0 || mutation.isPending}
          onClick={() => mutation.mutate({ allValid: true })}
        >
          {t('accountRequests.approveValid', { count: pendingValid })}
        </Button>
        {chosen.length > 0 && (
          <>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ approveItemIds: chosen })}
            >
              {t('accountRequests.approveSelected', { count: chosen.length })}
            </Button>
            <Button
              variant="danger-ghost"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ rejectItemIds: chosen })}
            >
              {t('accountRequests.rejectSelected', { count: chosen.length })}
            </Button>
          </>
        )}
        <Button variant="danger-ghost" className="sm:ml-auto" onClick={onReject}>
          {t('accountRequests.reject')}
        </Button>
      </div>
      <p className="text-sm text-fg-muted">{t('accountRequests.selectHint')}</p>
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
    </div>
  );
}

/** Các Phiếu tài khoản của yêu cầu; hết 7 ngày thì không tải được nữa (Q94). */
function SlipsSection({ requestId, status }: { requestId: string; status: AccountRequestStatus }) {
  const { t } = useTranslation();
  const slips = useQuery({
    ...credentialSlipsQuery(requestId, status),
    enabled: status !== 'parsing' && status !== 'parse_failed',
  });
  if (!slips.data || slips.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">{t('credentialSlips.heading')}</h2>
      <p className="text-sm text-fg-muted">{t('credentialSlips.hint')}</p>
      <ul className="flex flex-col gap-3">
        {slips.data.map((slip) => (
          <li key={slip.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {t('credentialSlips.item', {
                  count: slip.itemCount,
                  time: formatDateTime(slip.createdAt),
                })}
              </span>
              <Badge tone={slip.status === 'ready' ? 'success' : 'warning'}>
                {t(`credentialSlips.status.${slip.status}`)}
              </Badge>
            </p>
            {slip.status === 'ready' && (
              <>
                <p className="text-sm text-fg-muted tabular-nums">
                  {t('credentialSlips.expires', { time: formatDateTime(slip.expiresAt) })}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a href={slipUrl(slip.id, 'pdf')} download className={buttonClass('primary')}>
                    <FileDown aria-hidden className="size-5" />
                    {t('credentialSlips.downloadPdf')}
                  </a>
                  <a href={slipUrl(slip.id, 'xlsx')} download className={buttonClass('secondary')}>
                    <FileSpreadsheet aria-hidden className="size-5" />
                    {t('credentialSlips.downloadXlsx')}
                  </a>
                </div>
              </>
            )}
            {slip.status === 'expired' && (
              <p className="text-sm text-fg-muted">{t('credentialSlips.expired')}</p>
            )}
            {slip.status === 'failed' && <ErrorMessage>{t('credentialSlips.failed')}</ErrorMessage>}
          </li>
        ))}
      </ul>
    </section>
  );
}
