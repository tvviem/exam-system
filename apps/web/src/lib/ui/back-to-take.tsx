import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonClass } from '.';

/**
 * Nút quay về Phiên thi ở các trang Tài khoản của Người dự thi (Q283): trước giờ thi họ dễ bối rối khi lỡ vào trang này.
 * Chỉ hiện cho người chỉ mang Nhãn Người dự thi; người có thêm khu Soạn đề đã có menu chuyển khu.
 */
export function BackToTake() {
  const { t } = useTranslation();
  const { me } = useRouteContext({ from: '/_authed' });
  const candidateOnly =
    me.roleTags.includes('candidate') && !me.isAdmin && !me.roleTags.includes('examiner');
  if (!candidateOnly) return null;
  return (
    <Link to="/take" className={buttonClass('secondary', 'w-fit')}>
      <ArrowLeft aria-hidden className="size-5" />
      {t('nav.backToTake')}
    </Link>
  );
}
