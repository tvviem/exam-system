import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { attemptQueryKey, startAttempt, takeSessionsQuery } from '../../../../lib/take';
import { Button, buttonClass, Card, ErrorMessage, PrimaryButton } from '../../../../lib/ui';
import { ListSkeleton } from '../../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/take/sessions/$sessionId')({
  component: ConfirmPage,
});

/** Màn xác nhận trước khi bắt đầu (Q210): nêu rõ điều hệ thống ghi nhận, rồi mới chạy đồng hồ. */
function ConfirmPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessions = useQuery(takeSessionsQuery);
  const session = sessions.data?.items.find((item) => item.sessionId === sessionId);

  const start = useMutation({
    mutationFn: () => startAttempt(sessionId),
    onSuccess: async (state) => {
      if (state.status === 'in_progress') {
        queryClient.setQueryData(attemptQueryKey(state.attempt.id), state);
      }
      void queryClient.invalidateQueries({ queryKey: takeSessionsQuery.queryKey });
      await navigate({ to: '/take/attempts/$attemptId', params: { attemptId: state.attempt.id } });
    },
  });

  if (sessions.isPending) return <ListSkeleton rows={2} />;
  if (!session) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <ErrorMessage>{t('take.confirm.notFound')}</ErrorMessage>
        <Link to="/take" className={buttonClass('secondary', 'self-start')}>
          {t('take.backToList')}
        </Link>
      </div>
    );
  }
  const resuming = session.inProgressAttemptId !== null;
  const usable = session.deviceStatus === 'active';
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">{session.title}</h1>
      <Card className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-fg-muted">{t('take.confirm.exam')}</dt>
          <dd className="font-medium">{session.examTitle}</dd>
          <dt className="text-fg-muted">{t('take.confirm.questions')}</dt>
          <dd className="font-medium">
            {t('take.confirm.questionCount', { count: session.questionCount })}
          </dd>
          <dt className="text-fg-muted">{t('take.confirm.duration')}</dt>
          <dd className="font-medium">
            {t('take.confirm.minutes', { count: session.durationMinutes })}
          </dd>
          <dt className="text-fg-muted">{t('take.confirm.attempts')}</dt>
          <dd className="font-medium">
            {t('take.confirm.attemptsUsed', {
              used: session.attemptsUsed,
              max: session.maxAttempts,
            })}
          </dd>
          <dt className="text-fg-muted">{t('take.confirm.closesAt')}</dt>
          <dd className="font-medium">{formatDateTime(session.closesAt)}</dd>
        </dl>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>{t('take.confirm.noticeDevice')}</li>
          <li>{t('take.confirm.noticeClock')}</li>
          <li>{t('take.confirm.noticeAutosave')}</li>
        </ul>
      </Card>
      {!usable && <ErrorMessage>{t('take.confirm.needCode')}</ErrorMessage>}
      {start.isError && <ErrorMessage>{errorMessage(t, start.error)}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link to="/take" className={buttonClass('secondary')}>
          {t('take.backToList')}
        </Link>
        {usable ? (
          <PrimaryButton loading={start.isPending} onClick={() => start.mutate()}>
            {start.isPending
              ? t('take.confirm.starting')
              : resuming
                ? t('take.confirm.resume')
                : t('take.confirm.start')}
          </PrimaryButton>
        ) : (
          <Button disabled>{t('take.confirm.start')}</Button>
        )}
      </div>
    </div>
  );
}
