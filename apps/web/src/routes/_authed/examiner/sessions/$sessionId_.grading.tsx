import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { BackToResults, GradingScreen } from '../../../../lib/ui/grading/grading-screen';

// Màn Chấm Câu tự luận (Q290–Q293); `?item=` là câu đang chấm.
export const Route = createFileRoute('/_authed/examiner/sessions/$sessionId_/grading')({
  validateSearch: (search: Record<string, unknown>): { item?: string } => ({
    item: typeof search.item === 'string' && search.item ? search.item : undefined,
  }),
  staticData: { wide: true },
  component: GradingPage,
});

function GradingPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const { item } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('session.title'), to: '/examiner/sessions' },
          { label: t('grading.results.title'), to: `/examiner/sessions/${sessionId}/results` },
          { label: t('grading.title') },
        ]}
      />
      <GradingScreen
        sessionId={sessionId}
        itemId={item}
        onItem={(next) => navigate({ search: { item: next }, replace: true })}
        backTo={<BackToResults sessionId={sessionId} />}
      />
    </div>
  );
}
