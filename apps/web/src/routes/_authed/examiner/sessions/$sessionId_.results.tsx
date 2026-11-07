import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { ResultsScreen } from '../../../../lib/ui/grading/results-screen';

// Kết quả của một Phiên thi cho người được Ủy quyền chấm (Q307): người này không vào được trang chi tiết Phiên thi của chủ.
export const Route = createFileRoute('/_authed/examiner/sessions/$sessionId_/results')({
  staticData: { wide: true },
  component: ResultsPage,
});

function ResultsPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('session.title'), to: '/examiner/sessions' },
          { label: t('grading.results.title') },
        ]}
      />
      <ResultsScreen sessionId={sessionId} />
    </div>
  );
}
