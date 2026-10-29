import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Ban,
  CircleAlert,
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
import { Chip, ChipGroup } from './chips';
import { DataList } from './data-list';
import { StickyActionBar } from './sticky-action-bar';
import { useToast } from './toast';

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
      <CircleCheck aria-hidden className="size-3.5" />
    ) : status === 'partially_approved' ? (
      <CircleAlert aria-hidden className="size-3.5" />
    ) : status === 'rejected' || status === 'parse_failed' ? (
      <CircleX aria-hidden className="size-3.5" />
    ) : (
      <Hourglass aria-hidden className="size-3.5" />
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
      <CircleAlert aria-hidden className="size-3.5" />
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

          <SlipsSection requestId={id} status={request.data.status} />

          {data && data.status !== 'parsing' && data.status !== 'parse_failed' && (
            <>
              {reviewable && (
                <p className="text-sm text-fg-muted">{t('accountRequests.selectHint')}</p>
              )}
              <ChipGroup label={t('accountRequests.filterRows')}>
                <Chip
                  active={!matchStatus}
                  count={data.rowCount ?? 0}
                  onClick={() => onFilterChange({})}
                >
                  {t('accountRequests.allRows')}
                </Chip>
                {MATCH_STATUSES.map((status) => (
                  <Chip
                    key={status}
                    active={matchStatus === status}
                    count={data.counts[status]}
                    onClick={() => onFilterChange({ matchStatus: status })}
                  >
                    {t(`matchStatus.${status}`)}
                  </Chip>
                ))}
              </ChipGroup>

              {items.isPending ? (
                <ListSkeleton />
              ) : items.isError ? (
                <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>
              ) : items.data.items.length === 0 ? (
                <EmptyState>{t('accountRequests.itemsEmpty')}</EmptyState>
              ) : (
                <>
                  <ItemList items={items.data.items} admin={admin} selection={selection} />
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
      {/* Cuối nội dung: thanh dính đáy chỉ "ghim" khi vị trí tự nhiên của nó nằm dưới màn hình */}
      {reviewable && data && (
        <ReviewBar
          id={id}
          pendingValid={data.pendingValid}
          selected={selected}
          onDone={() => setSelected(new Set())}
          onReject={() => setRejecting(true)}
        />
      )}
      {rejecting && <RejectDialog id={id} onClose={() => setRejecting(false)} />}
    </section>
  );
}

/**
 * Ghi chú dưới huy hiệu kiểm tra: lý do bị chặn hoặc bỏ qua; dòng còn chờ thì nhắc việc sẽ xảy ra khi duyệt.
 * Dòng đã xử lý chỉ hiện kết quả, không còn câu hướng dẫn của trạng thái chờ.
 */
function ItemNote({ item }: { item: AccountRequestItem }) {
  const { t } = useTranslation();
  const text = item.outcomeNote
    ? t(`accountRequestRowError.${item.outcomeNote}`, { defaultValue: item.outcomeNote })
    : item.outcome === 'pending'
      ? t(`matchStatusHint.${item.matchStatus}`)
      : null;
  return text ? <p className="mt-1 text-sm">{text}</p> : null;
}

const identityOf = (item: AccountRequestItem) =>
  [item.code, item.email].filter(Boolean).join(' · ');

function MatchedUser({ item, admin }: { item: AccountRequestItem; admin: boolean }) {
  const { t } = useTranslation();
  if (!item.matchedUser) return null;
  return (
    <p className="text-sm text-fg-muted">
      {item.outcome === 'created'
        ? t('accountRequests.createdAccount')
        : t('accountRequests.matchedAccount')}
      :{' '}
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

function ItemList({ items, admin, selection }: ItemListProps) {
  const { t } = useTranslation();
  const matchCell = (item: AccountRequestItem) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MatchBadge status={item.matchStatus} />
        {item.outcome !== 'pending' && <Badge>{t(`itemOutcome.${item.outcome}`)}</Badge>}
      </div>
      <ItemNote item={item} />
      <MatchedUser item={item} admin={admin} />
    </>
  );
  return (
    <DataList
      items={items}
      rowKey={(item) => item.id}
      selectionHeader={<span className="sr-only">{t('accountRequests.columns.select')}</span>}
      selectionCell={
        selection ? (item) => <RowCheckbox item={item} selection={selection} /> : undefined
      }
      columns={[
        {
          key: 'row',
          header: t('accountRequests.columns.row'),
          className: 'tabular-nums text-fg-muted',
          cell: (item) => item.rowNumber,
        },
        {
          key: 'name',
          header: t('accountRequests.columns.fullName'),
          className: 'font-medium',
          cell: (item) => (
            <>
              {item.fullName ?? '—'}
              {/* 768–1023 px: cột Mã/Email và Lớp ẩn đi, gộp thành dòng phụ dưới tên */}
              <p className="mt-0.5 text-sm font-normal text-fg-muted lg:hidden">
                {[identityOf(item), item.classLabel].filter(Boolean).join(' · ')}
              </p>
            </>
          ),
        },
        {
          key: 'identity',
          header: t('accountRequests.columns.identity'),
          from: 'lg',
          className: 'text-fg-muted',
          cell: identityOf,
        },
        {
          key: 'class',
          header: t('accountRequests.columns.classLabel'),
          from: 'lg',
          className: 'text-fg-muted',
          cell: (item) => item.classLabel,
        },
        { key: 'match', header: t('accountRequests.columns.match'), cell: matchCell },
      ]}
      card={(item) => (
        <div className="rounded-xl border border-border bg-surface p-4">
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
          <div className="mt-2">{matchCell(item)}</div>
        </div>
      )}
    />
  );
}

function RejectDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => rejectAccountRequest(id, note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(t('toast.requestRejected'));
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
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (selection: ApprovalSelection) => approveAccountRequest(id, selection),
    onSuccess: async () => {
      toast(t('toast.approvalStarted'));
      onDone();
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const chosen = [...selected];
  return (
    <StickyActionBar>
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
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
    </StickyActionBar>
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
