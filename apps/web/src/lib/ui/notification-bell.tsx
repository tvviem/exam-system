import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../format';
import { type AppNotification, markNotificationsRead, notificationsQuery } from '../notifications';
import { Badge, Button, Dialog } from '.';

/** Chuông thông báo trên thanh trên cùng: số chưa đọc, bấm mở danh sách (Q95). */
export function NotificationBell({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const notifications = useQuery(notificationsQuery);
  const unread = notifications.data?.unreadCount ?? 0;
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: (list) => queryClient.setQueryData(notificationsQuery.queryKey, list),
  });

  const textOf = (n: AppNotification) => {
    const key =
      n.type === 'account_request.reviewed'
        ? `notification.account_request.reviewed_${String(n.data.status)}`
        : `notification.${n.type}`;
    return t(key, { ...n.data, defaultValue: t('notification.unknown') });
  };
  const openNotification = async (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    const requestId = typeof n.data.requestId === 'string' ? n.data.requestId : null;
    if (n.type.startsWith('account_request.') && requestId) {
      await navigate(
        isAdmin
          ? { to: '/admin/account-requests/$requestId', params: { requestId } }
          : { to: '/examiner/account-requests/$requestId', params: { requestId } },
      );
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={
          unread > 0 ? t('notification.bell', { count: unread }) : t('notification.bellNone')
        }
        aria-haspopup="dialog"
        className="relative inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft hover:text-fg"
        onClick={() => setOpen(true)}
      >
        <Bell aria-hidden className="size-6" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1 min-w-5 rounded-full bg-danger px-1 text-center text-[13px] font-semibold text-on-danger"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('nav.notifications')}>
        {notifications.data?.items.length ? (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {notifications.data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className="flex min-h-12 w-full cursor-pointer flex-col gap-1 py-3 text-left hover:bg-primary-soft"
                  >
                    <span className={n.readAt ? 'text-fg-muted' : 'font-medium'}>{textOf(n)}</span>
                    <span className="flex items-center gap-2 text-sm text-fg-muted tabular-nums">
                      {formatDateTime(n.createdAt)}
                      {!n.readAt && <Badge tone="primary">{t('notification.unread')}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {unread > 0 && (
              <Button disabled={markRead.isPending} onClick={() => markRead.mutate(undefined)}>
                {t('notification.markAllRead')}
              </Button>
            )}
          </>
        ) : (
          <p className="text-fg-muted">{t('notification.empty')}</p>
        )}
      </Dialog>
    </>
  );
}
