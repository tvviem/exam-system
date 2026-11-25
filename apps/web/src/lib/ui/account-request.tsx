import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Hourglass,
  RotateCcw,
  UserRoundCheck,
  UserRoundPlus,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AccountRequestItem,
  type AccountRequestItemParams,
  type AccountRequestStatus,
  accountRequestItemsQuery,
  accountRequestQuery,
  approveAccountRequest,
  existingMatchCount,
  isExistingMatch,
  MATCH_TONE,
  type MatchStatus,
  rejectAccountRequest,
} from '../account-requests';
import { errorMessage } from '../errors';
import { formatDate, formatDateTime } from '../format';
import { Badge, BusyNotice, Button, Dialog, ErrorMessage } from '.';
import {
  differingFields,
  ExistingMatchBanner,
  GroupCards,
  MatchDialog,
  needsConfirmation,
} from './account-request-review';
import { ActivationTracking } from './activation-tracking';
import { EmptyState, ListSkeleton, Pagination } from './admin';
import { DataList, HIGHLIGHT_BG } from './data-list';
import { RowMenu } from './row-menu';
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

export function MatchBadge({ status }: { status: MatchStatus }) {
  const { t } = useTranslation();
  const icon =
    status === 'new' ? (
      <UserRoundPlus aria-hidden className="size-3" />
    ) : status === 'exact' ? (
      <UserRoundCheck aria-hidden className="size-3" />
    ) : status === 'blocked' ? (
      <Ban aria-hidden className="size-3" />
    ) : status === 'restore' ? (
      <RotateCcw aria-hidden className="size-3" />
    ) : (
      <CircleAlert aria-hidden className="size-3.5" />
    );
  return (
    <Badge tone={MATCH_TONE[status]} icon={icon}>
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
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const data = request.data;
  const reviewable = admin && data?.status === 'pending';
  const { group } = filter;
  const items = useQuery({
    ...accountRequestItemsQuery(id, filter, data?.status),
    enabled: !!data && data.status !== 'parsing' && data.status !== 'parse_failed',
  });

  // Hàng chờ "cần xác nhận" (nhóm nhỏ): để hộp thoại tự chuyển sang dòng kế tiếp sau mỗi quyết định.
  const confirmQueue = useQuery({
    ...accountRequestItemsQuery(id, { group: 'confirm' }, data?.status),
    enabled: admin && !!data && data.status !== 'parsing' && data.status !== 'parse_failed',
  });
  const decide = useMutation({
    mutationFn: (input: { itemId: string; approve: boolean }) =>
      approveAccountRequest(
        id,
        input.approve ? { approveItemIds: [input.itemId] } : { rejectItemIds: [input.itemId] },
      ),
    onSuccess: async (_result, input) => {
      const rowNumber = confirmQueue.data?.items.find((i) => i.id === input.itemId)?.rowNumber;
      toast(t('accountRequests.review.decided', { n: rowNumber ?? '' }));
      // Dòng cần xác nhận kế tiếp (còn chờ, khác dòng vừa quyết): hộp thoại chuyển sang đó, hoặc đóng nếu hết.
      const next = (confirmQueue.data?.items ?? []).find(
        (i) => i.id !== input.itemId && needsConfirmation(i),
      );
      setReviewingId(next?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const reviewing =
    [...(items.data?.items ?? []), ...(confirmQueue.data?.items ?? [])].find(
      (i) => i.id === reviewingId,
    ) ?? null;

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
              {request.data.status === 'pending' && request.data.groups.confirm.pending > 0 && (
                <span className="text-sm font-medium">
                  {t('accountRequests.pendingConfirm', {
                    count: request.data.groups.confirm.pending,
                  })}
                </span>
              )}
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
            <BusyNotice title={t('accountRequests.parsingHint')} hint={t('busy.longWait')} />
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
            <BusyNotice title={t('accountRequests.approvingHint')} hint={t('busy.longWait')} />
          )}

          {(request.data.status === 'approved' || request.data.status === 'partially_approved') && (
            <p role="note" className="rounded-lg border border-border bg-surface p-3 text-sm">
              {t('accountRequests.activationNote')}
            </p>
          )}

          {(request.data.status === 'approved' || request.data.status === 'partially_approved') && (
            <ActivationTracking requestId={id} />
          )}

          {data && data.status !== 'parsing' && data.status !== 'parse_failed' && (
            <>
              {!admin &&
                data.status !== 'rejected' &&
                data.counts.new === 0 &&
                data.counts.restore === 0 &&
                data.counts.exact + data.counts.name_mismatch > 0 && (
                  <p role="note" className="rounded-lg border border-border bg-surface p-3 text-sm">
                    {t('accountRequests.allExistingHint')}
                  </p>
                )}
              {data.status !== 'rejected' && existingMatchCount(data.counts) > 0 && (
                <ExistingMatchBanner
                  count={existingMatchCount(data.counts)}
                  filtered={!!filter.existing}
                  onFilter={() => onFilterChange({ existing: true })}
                />
              )}
              <GroupCards
                groups={data.groups}
                active={group}
                onChange={(next) => onFilterChange({ group: next })}
              />
              {(group || filter.existing) && (
                <Button className="w-fit" variant="ghost" onClick={() => onFilterChange({})}>
                  {t('accountRequests.showAll', { count: data.rowCount ?? 0 })}
                </Button>
              )}

              {items.isPending ? (
                <ListSkeleton />
              ) : items.isError ? (
                <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>
              ) : items.data.items.length === 0 ? (
                <EmptyState>{t('accountRequests.itemsEmpty')}</EmptyState>
              ) : (
                <>
                  <ItemList
                    items={items.data.items}
                    admin={admin}
                    canDecide={reviewable}
                    onReview={(item) => setReviewingId(item.id)}
                    onRejectRow={(item) => decide.mutate({ itemId: item.id, approve: false })}
                  />
                  <Pagination
                    page={items.data.page}
                    pageSize={items.data.pageSize}
                    total={items.data.total}
                    onPage={(next) =>
                      onFilterChange({ ...filter, page: next > 1 ? next : undefined })
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
        <ReviewBar id={id} ready={data.pendingValid} onReject={() => setRejecting(true)} />
      )}
      {rejecting && <RejectDialog id={id} onClose={() => setRejecting(false)} />}
      {admin && data && reviewing && (
        <MatchDialog
          item={reviewing}
          requestStatus={data.status}
          deciding={decide.isPending}
          error={decide.isError ? errorMessage(t, decide.error) : null}
          onClose={() => setReviewingId(null)}
          onApprove={() => decide.mutate({ itemId: reviewing.id, approve: true })}
          onReject={() => decide.mutate({ itemId: reviewing.id, approve: false })}
        />
      )}
    </section>
  );
}

/**
 * Một dòng phụ ngắn dưới huy hiệu (chi tiết đầy đủ nằm trong hộp thoại đối chiếu): với dòng cần xác nhận của Quản trị viên là các trường
 * khác nhau; còn lại là lý do bị chặn hoặc bỏ qua, hoặc việc sẽ xảy ra khi duyệt (dòng còn chờ).
 */
function ItemNote({ item, admin }: { item: AccountRequestItem; admin: boolean }) {
  const { t } = useTranslation();
  let text: string | null = null;
  if (admin && item.matchedUser && item.matchStatus === 'restore' && item.outcome === 'pending') {
    text = differsText(item, t);
  } else if (
    admin &&
    item.matchedUser &&
    item.matchStatus === 'name_mismatch' &&
    item.outcome === 'pending'
  ) {
    text = differsText(item, t);
  } else if (item.outcomeNote && !(admin && item.outcomeNote === 'will_restore')) {
    text = t(`accountRequestRowError.${item.outcomeNote}`, { defaultValue: item.outcomeNote });
  } else if (item.outcome === 'pending' && !(admin && item.matchStatus === 'restore')) {
    text = t(`matchStatusHint.${item.matchStatus}`);
  }
  return text ? <p className="mt-1 text-sm">{text}</p> : null;
}

function differsText(item: AccountRequestItem, t: TFunction) {
  const fields = differingFields(item);
  return fields.length === 0
    ? t('accountRequests.review.same')
    : t('accountRequests.review.differs', {
        fields: fields.map((f) => t(`accountRequestFieldNames.${f}`)).join(', '),
      });
}

const identityOf = (item: AccountRequestItem) =>
  [item.code, item.email].filter(Boolean).join(' · ');

interface ItemListProps {
  items: AccountRequestItem[];
  admin: boolean;
  /** Quản trị viên đang duyệt (Yêu cầu còn chờ duyệt): cho từ chối từng dòng và quyết định dòng cần xác nhận. */
  canDecide: boolean;
  onReview: (item: AccountRequestItem) => void;
  onRejectRow: (item: AccountRequestItem) => void;
}

function ItemList({ items, admin, canDecide, onReview, onRejectRow }: ItemListProps) {
  const { t } = useTranslation();
  const matchCell = (item: AccountRequestItem) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <MatchBadge status={item.matchStatus} />
        {item.outcome !== 'pending' && <Badge>{t(`itemOutcome.${item.outcome}`)}</Badge>}
      </div>
      <ItemNote item={item} admin={admin} />
      {admin && item.matchedUser && (
        <Button
          className="mt-2"
          aria-label={t(
            needsConfirmation(item) && canDecide
              ? 'accountRequests.review.openDecideAria'
              : 'accountRequests.review.openAria',
            { n: item.rowNumber },
          )}
          onClick={() => onReview(item)}
        >
          {t(
            needsConfirmation(item) && canDecide
              ? 'accountRequests.review.openDecide'
              : 'accountRequests.review.open',
          )}
        </Button>
      )}
    </>
  );
  const rowMenu = (item: AccountRequestItem) =>
    canDecide && item.outcome === 'pending' && item.matchStatus !== 'blocked' ? (
      <RowMenu
        label={t('accountRequests.rowActions', { n: item.rowNumber })}
        items={[
          {
            label: t('accountRequests.rejectRowAction'),
            danger: true,
            onSelect: () => onRejectRow(item),
          },
        ]}
      />
    ) : null;
  return (
    <DataList
      items={items}
      rowKey={(item) => item.id}
      highlight={(item) => isExistingMatch(item.matchStatus)}
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
          className: 'min-w-40 font-medium',
          cell: (item) => (
            <>
              {item.fullName ?? '—'}
              {/* 768–1023 px: cột Mã/Email và Lớp ẩn đi, gộp thành dòng phụ dưới tên */}
              <p className="mt-0.5 text-sm font-normal break-words text-fg-muted lg:hidden">
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
        {
          key: 'actions',
          header: <span className="sr-only">{t('accountRequests.columns.actions')}</span>,
          cell: (item) => rowMenu(item),
        },
      ]}
      card={(item) => (
        <div
          className={`rounded-xl border p-4 ${isExistingMatch(item.matchStatus) ? `${HIGHLIGHT_BG} border-warning border-l-4` : 'border-border bg-surface'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {t('accountRequests.row', { n: item.rowNumber })}
            </p>
            {rowMenu(item)}
          </div>
          <p className="font-medium break-words">{item.fullName ?? '—'}</p>
          <p className="text-sm break-words text-fg-muted">
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
/**
 * Thanh dưới của Quản trị viên: MỘT nút chính duy nhất "Duyệt N dòng sẵn sàng" (chỉ nhóm sẵn sàng; dòng cần xác nhận quyết định trong hộp
 * thoại đối chiếu). "Từ chối yêu cầu" nằm trong menu phụ, tách khỏi nút chính.
 */
function ReviewBar({ id, ready, onReject }: { id: string; ready: number; onReject: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => approveAccountRequest(id, { allValid: true }),
    onSuccess: async () => {
      toast(t('toast.approvalStarted'));
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  return (
    <StickyActionBar>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          className="flex-1 sm:flex-none"
          loading={mutation.isPending}
          disabled={ready === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t('accountRequests.approveReady', { count: ready })}
        </Button>
        <RowMenu
          label={t('accountRequests.moreActions')}
          items={[{ label: t('accountRequests.reject'), danger: true, onSelect: onReject }]}
        />
      </div>
      <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
    </StickyActionBar>
  );
}
