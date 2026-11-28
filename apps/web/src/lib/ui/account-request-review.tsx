import { Link } from '@tanstack/react-router';
import { RotateCcw, TriangleAlert, UserRoundCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AccountRequestDetail,
  AccountRequestItem,
  AccountRequestStatus,
  ItemGroup,
} from '../account-requests';
import { formatDateTime } from '../format';
import { Badge, Button, Dialog, ErrorMessage } from '.';

const sameText = (a: string | null, b: string | null) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const FIELDS = ['fullName', 'code', 'email', 'classLabel'] as const;
export type CompareField = (typeof FIELDS)[number];

/** Trường mà dòng trong file khác với tài khoản có sẵn (rỗng nếu không có tài khoản khớp). */
export function differingFields(item: AccountRequestItem): CompareField[] {
  const account = item.matchedUser;
  if (!account) return [];
  return FIELDS.filter((field) => !sameText(item[field], account[field]));
}

/** Dòng cần Quản trị viên quyết định: khôi phục tài khoản đã Xóa, hoặc khớp nhưng khác họ tên. */
export const needsConfirmation = (item: AccountRequestItem) =>
  item.outcome === 'pending' &&
  (item.matchStatus === 'restore' || item.matchStatus === 'name_mismatch');

const GROUP_ORDER: ItemGroup[] = ['ready', 'confirm', 'blocked'];

/**
 * Ba thẻ nhóm việc của Yêu cầu (thay hàng chip lọc): sẵn sàng duyệt, cần xác nhận, không duyệt được. Số lớn là số dòng đang chờ (nhóm
 * không duyệt được: tổng số dòng). Bấm thẻ để lọc danh sách, bấm lại để bỏ lọc.
 */
export function GroupCards({
  groups,
  active,
  onChange,
}: {
  groups: AccountRequestDetail['groups'];
  active: ItemGroup | undefined;
  onChange: (next: ItemGroup | undefined) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="mb-1 text-sm font-medium">{t('accountRequests.groups.legend')}</legend>
      {GROUP_ORDER.map((group) => {
        const value = groups[group];
        const count = 'pending' in value ? value.pending : value.total;
        const attention = group === 'confirm' && count > 0;
        return (
          <button
            key={group}
            type="button"
            aria-pressed={active === group}
            onClick={() => onChange(active === group ? undefined : group)}
            className={`flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${
              active === group
                ? 'border-primary bg-primary-soft text-on-primary-soft'
                : attention
                  ? 'border-warning bg-warning-soft'
                  : 'border-border bg-surface'
            }`}
          >
            <span className="flex flex-col">
              <span className="font-medium">{t(`accountRequests.groups.${group}`)}</span>
              <span className="text-sm text-fg-muted">
                {t(`accountRequests.groups.${group}Hint`, { total: value.total })}
              </span>
            </span>
            <span className="text-2xl font-semibold tabular-nums">{count}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * Hộp thoại "Đối chiếu dòng N" (Quản trị viên): tài khoản có sẵn mà dòng này khớp, so từng trường với file, hậu quả của việc duyệt, và
 * quyết định ngay tại đây. Nút bấm trong hộp thoại chính là bước xác nhận.
 */
export function MatchDialog({
  item,
  requestStatus,
  deciding,
  error,
  onClose,
  onApprove,
  onReject,
}: {
  item: AccountRequestItem;
  requestStatus: AccountRequestStatus;
  deciding: boolean;
  error: string | null;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useTranslation();
  const account = item.matchedUser;
  const restore = item.matchStatus === 'restore';
  const decidable = needsConfirmation(item);
  const busy = requestStatus !== 'pending';
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('accountRequests.review.title', { n: item.rowNumber, name: item.fullName ?? '—' })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {decidable ? (
            <>
              <Button onClick={onClose}>{t('accountRequests.review.later')}</Button>
              <Button variant="danger-ghost" disabled={busy || deciding} onClick={onReject}>
                {t('accountRequests.review.rejectRow')}
              </Button>
              <Button
                variant="primary"
                loading={deciding}
                disabled={busy || deciding}
                onClick={onApprove}
              >
                {t(restore ? 'accountRequests.review.restore' : 'accountRequests.review.sameUser')}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t('common.close')}</Button>
          )}
        </div>
      }
    >
      {account && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                account.status === 'removed'
                  ? 'danger'
                  : account.status === 'locked'
                    ? 'warning'
                    : 'success'
              }
              icon={
                restore ? (
                  <RotateCcw aria-hidden className="size-3" />
                ) : (
                  <UserRoundCheck aria-hidden className="size-3" />
                )
              }
            >
              {t(`accountRequests.compare.state.${account.status}`)}
            </Badge>
            {account.status === 'removed' && account.removedAt && (
              <span>
                {account.removedByName
                  ? t('accountRequests.compare.removedAt', {
                      time: formatDateTime(account.removedAt),
                      name: account.removedByName,
                    })
                  : t('accountRequests.compare.removedAtUnknown', {
                      time: formatDateTime(account.removedAt),
                    })}
              </span>
            )}
          </div>
          {account.matchedBy && (
            <p>
              <span className="text-fg-muted">{t('accountRequests.compare.matchedBy')}: </span>
              {t(`accountRequests.compare.by.${account.matchedBy}`)}
            </p>
          )}
          <p>
            <span className="text-fg-muted">{t('accountRequests.compare.roles')}: </span>
            {[
              ...(account.isAdmin ? [t('accountRequests.compare.admin')] : []),
              ...account.roleTags.map((tag) => t(`roleTag.${tag}`)),
            ].join(', ') || t('accountRequests.compare.noRoles')}
          </p>

          <div className="flex flex-col rounded-lg border border-border">
            {FIELDS.map((field) => {
              const equal = sameText(item[field], account[field]);
              const label = t(`accountRequests.compare.field.${field}`);
              // Trường giống nhau chỉ một dòng; trường khác nhau mới mở rộng hai giá trị (làm nổi đúng chỗ cần quyết).
              return equal ? (
                <div
                  key={field}
                  className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0"
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{label}: </span>
                    {item[field] || t('accountRequests.compare.empty')}
                  </span>
                  <Badge tone="success">{t('accountRequests.compare.same')}</Badge>
                </div>
              ) : (
                <div
                  key={field}
                  className="flex flex-col gap-1 border-b border-border bg-warning-soft px-3 py-2 last:border-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{label}</span>
                    <Badge tone="warning">{t('accountRequests.compare.different')}</Badge>
                  </div>
                  <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    <span className="break-all">
                      <span className="text-fg-muted">{t('accountRequests.compare.file')}: </span>
                      {item[field] || t('accountRequests.compare.empty')}
                    </span>
                    <span className="break-all">
                      <span className="text-fg-muted">
                        {t('accountRequests.compare.account')}:{' '}
                      </span>
                      {account[field] || t('accountRequests.compare.empty')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {decidable && (
            <div className="rounded-lg bg-bg p-3">
              <p className="mb-1 font-medium">
                {t(restore ? 'accountRequests.review.ifRestore' : 'accountRequests.review.ifSame')}
              </p>
              <ul className="m-0 list-disc pl-5 break-words">
                {(restore ? ['keepHistory', 'pending', 'sendMail'] : ['tagOnly', 'noMail']).map(
                  (key) => (
                    <li key={key}>
                      {t(`accountRequests.review.consequence.${key}`, { email: item.email ?? '' })}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
          <Link
            to="/admin/users/$userId"
            params={{ userId: account.id }}
            className="w-fit text-primary hover:underline"
          >
            {t('accountRequests.compare.open')}
          </Link>
        </div>
      )}
      {decidable && busy && (
        <p role="status" className="text-sm text-fg-muted">
          {t('accountRequests.review.busy')}
        </p>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </Dialog>
  );
}

/**
 * Dải tóm tắt phía trên danh sách khi Yêu cầu có người đã có tài khoản: nêu số dòng, hậu quả (không có thư kích hoạt mới) và việc cần
 * làm (kiểm lại mã, email). Ghi chú tĩnh nên dùng role="note"; màu hổ phách đi cùng biểu tượng và chữ, không đứng một mình.
 */
export function ExistingMatchBanner({
  count,
  filtered,
  onFilter,
}: {
  count: number;
  /** Danh sách đang lọc theo nhóm này: không cần nút lọc nữa (đã có nút "Xem tất cả"). */
  filtered: boolean;
  onFilter: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="flex gap-3 rounded-xl border border-warning bg-warning-soft p-3 text-fg"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-semibold">{t('accountRequests.existing.title', { count })}</p>
        <p className="text-sm">{t('accountRequests.existing.body')}</p>
        {!filtered && (
          <Button className="w-fit" onClick={onFilter}>
            {t('accountRequests.existing.filter', { count })}
          </Button>
        )}
      </div>
    </div>
  );
}
