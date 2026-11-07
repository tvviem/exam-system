import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { adminSessionsQuery } from '../../../lib/grading';
import { Badge, Button, ErrorMessage, SearchField } from '../../../lib/ui';
import { EmptyState, ListSkeleton } from '../../../lib/ui/admin';
import { DelegateDialog } from '../../../lib/ui/grading/delegate-dialog';
import { PageHeader } from '../../../lib/ui/page-header';

// Quản trị viên cấp và thu hồi Ủy quyền chấm thay chủ Phiên thi khi có sự cố (Q307).
export const Route = createFileRoute('/_authed/admin/grading-delegates')({
  component: GradingDelegatesPage,
});

function GradingDelegatesPage() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const sessions = useQuery(adminSessionsQuery(q));
  return (
    <section className="flex flex-col gap-4">
      <PageHeader title={t('admin.gradingDelegates.heading')} />
      <p className="text-sm text-fg-muted">{t('admin.gradingDelegates.hint')}</p>
      <div className="max-w-md">
        <SearchField
          id="admin-session-search"
          label={t('admin.gradingDelegates.search')}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {sessions.isPending ? (
        <ListSkeleton rows={4} />
      ) : sessions.isError ? (
        <ErrorMessage>{errorMessage(t, sessions.error)}</ErrorMessage>
      ) : sessions.data.items.length === 0 ? (
        <EmptyState>{t('admin.gradingDelegates.empty')}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.data.items.map((item) => (
            <li
              key={item.sessionId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4"
            >
              <span className="min-w-0">
                <span className="block break-words font-medium">{item.title}</span>
                <span className="block text-sm text-fg-muted">
                  {t('admin.gradingDelegates.owner', { name: item.ownerName ?? '—' })} ·{' '}
                  {formatDateTime(item.opensAt)}
                </span>
                {item.cancelledAt && <Badge tone="danger">{t('session.phase.cancelled')}</Badge>}
              </span>
              <Button onClick={() => setOpenId(item.sessionId)}>
                <UserCog aria-hidden className="size-4" />
                {t('admin.gradingDelegates.manage')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {openId && <DelegateDialog sessionId={openId} admin open onClose={() => setOpenId(null)} />}
    </section>
  );
}
