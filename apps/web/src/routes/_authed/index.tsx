import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { homePathFor } from '../../lib/auth';
import { takeSessionsQuery } from '../../lib/take';
import { resumeTargetOf } from '../../lib/take/entry';

export const Route = createFileRoute('/_authed/')({
  beforeLoad: async ({ context }) => {
    const home = homePathFor(context.me);
    if (home === '/take' && !context.me.isAdmin) {
      // Người dự thi: đang có Lượt làm dở hoặc đang ở Phòng chờ thì đăng nhập xong vào thẳng đó (Q283/Q284).
      const target = await context.queryClient
        .fetchQuery({ ...takeSessionsQuery, staleTime: 0 })
        .then(({ items }) => resumeTargetOf(items))
        .catch(() => null); // Không tải được danh sách thì cứ về "Phiên thi của tôi", ở đó báo lỗi.
      if (target?.kind === 'attempt') {
        throw redirect({
          to: '/take/attempts/$attemptId',
          params: { attemptId: target.attemptId },
        });
      }
      if (target?.kind === 'session') {
        throw redirect({
          to: '/take/sessions/$sessionId',
          params: { sessionId: target.sessionId },
        });
      }
    }
    if (home) throw redirect({ to: home });
  },
  component: NoRolePage,
});

function NoRolePage() {
  const { t } = useTranslation();
  return <p className="text-fg-muted">{t('home.noRole')}</p>;
}
