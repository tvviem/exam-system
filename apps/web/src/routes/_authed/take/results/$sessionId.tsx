import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonClass } from '../../../../lib/ui';
import { MyResultScreen } from '../../../../lib/ui/grading/my-result';

// "Kết quả của tôi" sau khi Người ra đề Công bố (PR 5c).
// `?cau=` là số câu đang xem (số thứ tự Người dự thi đã thấy), để tải lại trang hay Back vẫn giữ đúng câu (Q318).
export const Route = createFileRoute('/_authed/take/results/$sessionId')({
  validateSearch: (search: Record<string, unknown>): { cau?: number } => {
    const cau = Number(search.cau);
    return Number.isInteger(cau) && cau >= 1 ? { cau } : {};
  },
  staticData: { wide: true },
  component: MyResultPage,
});

function MyResultPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  const { cau } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="flex flex-col gap-4">
      <MyResultScreen
        sessionId={sessionId}
        currentNo={cau}
        onCurrentNo={(no) => navigate({ search: { cau: no }, replace: true })}
      />
      <Link to="/take" className={buttonClass('secondary', 'mx-auto')}>
        {t('take.backToList')}
      </Link>
    </div>
  );
}
