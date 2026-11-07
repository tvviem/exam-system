import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonClass } from '../../../../lib/ui';
import { MyResultScreen } from '../../../../lib/ui/grading/my-result';

// "Kết quả của tôi" sau khi Người ra đề Công bố (PR 5c).
export const Route = createFileRoute('/_authed/take/results/$sessionId')({
  component: MyResultPage,
});

function MyResultPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  return (
    <div className="flex flex-col gap-4">
      <MyResultScreen sessionId={sessionId} />
      <Link to="/take" className={buttonClass('secondary', 'mx-auto')}>
        {t('take.backToList')}
      </Link>
    </div>
  );
}
