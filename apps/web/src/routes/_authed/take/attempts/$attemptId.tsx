import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../../../lib/api';
import { errorMessage } from '../../../../lib/errors';
import { attemptQuery } from '../../../../lib/take';
import { buttonClass, ErrorMessage } from '../../../../lib/ui';
import { AttemptRunner, StopScreen, SubmittedScreen } from '../../../../lib/ui/take-attempt';

export const Route = createFileRoute('/_authed/take/attempts/$attemptId')({
  staticData: { bare: true },
  component: AttemptPage,
});

function AttemptPage() {
  const { t } = useTranslation();
  const { attemptId } = Route.useParams();
  const attempt = useQuery(attemptQuery(attemptId));

  if (attempt.isPending) {
    return (
      <p role="status" className="p-6 text-center text-fg-muted">
        {t('take.loading')}
      </p>
    );
  }
  if (attempt.isError) {
    const revoked =
      attempt.error instanceof ApiError && attempt.error.details.reason === 'DEVICE_REVOKED';
    if (revoked) return <StopScreen reason="DEVICE_REVOKED" />;
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        <ErrorMessage>{errorMessage(t, attempt.error)}</ErrorMessage>
        <Link to="/take" className={buttonClass('secondary', 'self-start')}>
          {t('take.backToList')}
        </Link>
      </main>
    );
  }
  if (attempt.data.status === 'submitted') {
    return <SubmittedScreen submittedAt={attempt.data.attempt.submittedAt} />;
  }
  return <AttemptRunner view={attempt.data} />;
}
