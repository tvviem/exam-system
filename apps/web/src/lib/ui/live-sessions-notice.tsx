import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LiveSession } from '../admin';
import { formatTime } from '../format';

/**
 * Dải cảnh báo trên trang chi tiết người dùng khi người này đang trong Phiên thi đang diễn ra (Q264): Quản trị viên
 * thấy ngay vì sao Khóa đăng nhập và Xóa người dùng bị vô hiệu, và phải làm gì để mở lại.
 */
export function LiveSessionsNotice({ sessions, id }: { sessions: LiveSession[]; id: string }) {
  const { t } = useTranslation();
  if (sessions.length === 0) return null;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-fg"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="font-semibold">
          {t('admin.users.liveTitle')}
        </h2>
        <ul className="flex flex-col gap-1">
          {sessions.map((session) => (
            <li key={`${session.id}-${session.relation}`}>
              {session.relation === 'owner'
                ? t('admin.users.liveOwner', {
                    title: session.title,
                    time: formatTime(session.closesAt),
                    count: session.inProgress,
                  })
                : t('admin.users.liveCandidate', {
                    title: session.title,
                    time: formatTime(session.closesAt),
                    owner: session.ownerName ?? '',
                  })}
            </li>
          ))}
        </ul>
        <p className="text-fg-muted">{t('admin.users.liveHint')}</p>
      </div>
    </section>
  );
}
