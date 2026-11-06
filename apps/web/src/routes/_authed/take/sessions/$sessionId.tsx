import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { attemptQueryKey, startAttempt, takeSessionsQuery } from '../../../../lib/take';
import { formatCountdown } from '../../../../lib/take/countdown';
import { useWaitingRoom } from '../../../../lib/take/use-waiting-room';
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

  const waiting = session?.phase === 'upcoming' && session.waitingRoom;
  const remaining = useWaitingRoom(
    sessionId,
    session?.opensAt ?? '',
    // Vẫn báo có mặt khi Phiên thi đã mở mà chưa bấm bắt đầu, để Người ra đề không thấy "mất kết nối" oan.
    session !== undefined &&
      session.deviceStatus === 'active' &&
      session.inProgressAttemptId === null &&
      (waiting === true || session.phase === 'open'),
  );
  // Đã từng ở Phòng chờ rồi Phiên thi mở: báo một dòng, nút "Bắt đầu làm bài" tự bật (không tự bắt đầu).
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (waiting) wasWaiting.current = true;
  }, [waiting]);

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
            {t('take.session.questionCount', { count: session.questionCount })}
          </dd>
          <dt className="text-fg-muted">{t('take.confirm.duration')}</dt>
          <dd className="font-medium">
            {t('take.session.minutes', { count: session.durationMinutes })}
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
      {waiting && <WaitingPanel opensAt={session.opensAt} remaining={remaining} />}
      {!waiting && wasWaiting.current && session.phase === 'open' && !resuming && (
        <p role="status" className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
          {t('take.waitingRoom.opened')}
        </p>
      )}
      {!usable && <ErrorMessage>{t('take.confirm.needCode')}</ErrorMessage>}
      {start.isError && <ErrorMessage>{errorMessage(t, start.error)}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link to="/take" className={buttonClass('secondary')}>
          {t('take.backToList')}
        </Link>
        {usable && !waiting ? (
          <PrimaryButton loading={start.isPending} onClick={() => start.mutate()}>
            {start.isPending
              ? t('take.confirm.starting')
              : resuming
                ? t('take.confirm.resume')
                : t('take.confirm.start')}
          </PrimaryButton>
        ) : (
          <Button disabled>
            {waiting ? t('take.waitingRoom.startLocked') : t('take.confirm.start')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Phòng chờ (Q284): đếm ngược theo đồng hồ server, vài lời dặn; nút bắt đầu chỉ bật khi Phiên thi mở. */
function WaitingPanel({ opensAt, remaining }: { opensAt: string; remaining: number }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col items-center gap-3 text-center">
      <h2 className="text-base font-semibold">{t('take.waitingRoom.title')}</h2>
      <p className="text-sm text-fg-muted">{t('take.waitingRoom.countdown')}</p>
      <p
        className="font-mono text-4xl font-semibold tabular-nums"
        data-testid="waiting-countdown"
        aria-live="off"
      >
        {formatCountdown(remaining)}
      </p>
      <p className="text-sm text-fg-muted">
        {t('take.waitingRoom.opensAt', { time: formatDateTime(opensAt) })}
      </p>
      <p role="status" className="text-sm font-medium text-success">
        {t('take.waitingRoom.online')}
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-left text-sm">
        <li>{t('take.waitingRoom.tip1')}</li>
        <li>{t('take.waitingRoom.tip2')}</li>
        <li>{t('take.waitingRoom.tip3')}</li>
      </ul>
    </Card>
  );
}
