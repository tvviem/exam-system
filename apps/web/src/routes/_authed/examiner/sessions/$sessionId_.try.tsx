import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { previewQuery } from '../../../../lib/take';
import { buttonClass, ErrorMessage } from '../../../../lib/ui';
import { PreviewRunner } from '../../../../lib/ui/take-attempt';

// Xem thử qua Phiên thi (Q220, Q245, Q250): đi qua đề đúng như Người dự thi thấy, không ghi gì. Ở khu Người ra đề vì khu
// /take chỉ dành cho Người dự thi.
export const Route = createFileRoute('/_authed/examiner/sessions/$sessionId_/try')({
  staticData: { bare: true },
  component: PreviewPage,
});

function PreviewPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const preview = useQuery(previewQuery(sessionId));

  if (preview.isPending) {
    return (
      <p role="status" className="p-6 text-center text-fg-muted">
        {t('take.loading')}
      </p>
    );
  }
  if (preview.isError) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        <ErrorMessage>{errorMessage(t, preview.error)}</ErrorMessage>
        <Link
          to="/examiner/sessions/$sessionId"
          params={{ sessionId }}
          className={buttonClass('secondary', 'self-start')}
        >
          {t('take.preview.back')}
        </Link>
      </main>
    );
  }
  return (
    <PreviewRunner
      view={preview.data}
      onExit={() => void navigate({ to: '/examiner/sessions/$sessionId', params: { sessionId } })}
    />
  );
}
