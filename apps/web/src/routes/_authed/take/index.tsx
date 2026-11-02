import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../lib/errors';
import { takeSessionsQuery } from '../../../lib/take';
import { ErrorMessage } from '../../../lib/ui';
import { ListSkeleton } from '../../../lib/ui/admin';
import { JoinForm, TakeSessionList } from '../../../lib/ui/take-sessions';

export const Route = createFileRoute('/_authed/take/')({
  component: TakePage,
});

function TakePage() {
  const { t } = useTranslation();
  const sessions = useQuery(takeSessionsQuery);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{t('take.title')}</h1>
      <JoinForm />
      {sessions.isPending && <ListSkeleton rows={3} />}
      {sessions.isError && <ErrorMessage>{errorMessage(t, sessions.error)}</ErrorMessage>}
      {sessions.data && <TakeSessionList items={sessions.data.items} />}
    </div>
  );
}
