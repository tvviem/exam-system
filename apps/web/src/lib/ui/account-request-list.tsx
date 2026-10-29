import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AccountRequestListItem } from '../account-requests';
import { formatDateTime } from '../format';
import { RequestStatusBadge } from './account-request';

/** Một dòng trong danh sách yêu cầu; `admin` quyết định trang chi tiết mở ra. */
export function RequestListItem({ item, admin }: { item: AccountRequestListItem; admin: boolean }) {
  const { t } = useTranslation();
  const className =
    'flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-border-strong';
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.originalFilename}</p>
        <p className="truncate text-sm text-fg-muted tabular-nums">
          {admin && `${t('accountRequests.sentBy', { name: item.requesterName })} · `}
          {formatDateTime(item.createdAt)}
          {item.rowCount !== null && ` · ${t('accountRequests.rows', { count: item.rowCount })}`}
        </p>
        <div className="mt-2">
          <RequestStatusBadge status={item.status} />
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted" />
    </>
  );
  return admin ? (
    <Link
      to="/admin/account-requests/$requestId"
      params={{ requestId: item.id }}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <Link
      to="/examiner/account-requests/$requestId"
      params={{ requestId: item.id }}
      className={className}
    >
      {content}
    </Link>
  );
}
