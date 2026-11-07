import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { AppealScreen } from '../../../../lib/ui/grading/appeal-screen';

// Màn xử lý Phúc khảo (Q313); `?appeal=` là Phúc khảo đang xem. Chủ Phiên thi và người được Ủy quyền cùng dùng.
export const Route = createFileRoute('/_authed/examiner/sessions/$sessionId_/appeals')({
  validateSearch: (search: Record<string, unknown>): { appeal?: string } => ({
    appeal: typeof search.appeal === 'string' && search.appeal ? search.appeal : undefined,
  }),
  staticData: { wide: true },
  component: AppealsPage,
});

function AppealsPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const { appeal } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('session.title'), to: '/examiner/sessions' },
          { label: t('grading.results.title'), to: `/examiner/sessions/${sessionId}/results` },
          { label: t('appeal.panel.title') },
        ]}
      />
      <AppealScreen
        sessionId={sessionId}
        appealId={appeal}
        onAppeal={(id) => navigate({ search: { appeal: id }, replace: true, resetScroll: false })}
        backTo={
          <Link
            to="/examiner/sessions/$sessionId/results"
            params={{ sessionId }}
            className="inline-flex min-h-12 items-center gap-1 font-medium text-primary hover:underline pointer-fine:min-h-9"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t('appeal.screen.backToResults')}
          </Link>
        }
      />
    </div>
  );
}
