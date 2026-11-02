import { Link } from '@tanstack/react-router';
import { CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../format';
import type { SubmitReason } from '../take';
import type { StopReason } from '../take/use-saver';
import { buttonClass } from '.';

// Hai màn kết thúc của khu làm bài: thiết bị bị thu hồi (hoặc Lượt không còn) và Lượt đã nộp (Q244, Q206).

/** Server báo thiết bị bị thu hồi hoặc Lượt không còn: dừng hẳn, không cho làm tiếp (Q244). */
export function StopScreen({ reason }: { reason: Exclude<StopReason, 'ATTEMPT_CLOSED'> }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{t(`take.stop.${reason}.title`)}</h1>
      <p>{t(`take.stop.${reason}.body`)}</p>
      <Link to="/take" className={buttonClass('primary')}>
        {t('take.backToList')}
      </Link>
    </main>
  );
}

/** Lượt đã nộp: chỉ còn giờ nộp, không có nội dung đề và không có điểm (Q206). */
export function SubmittedScreen({
  submittedAt,
  reason,
}: {
  submittedAt: string | null;
  reason: SubmitReason | null;
}) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <CheckCheck aria-hidden className="size-12 text-success" />
      <h1 className="text-2xl font-semibold">{t('take.submitted.title')}</h1>
      {submittedAt && <p>{t('take.submitted.body', { time: formatDateTime(submittedAt) })}</p>}
      {reason && reason !== 'candidate' && <p>{t(`take.submitted.reason.${reason}`)}</p>}
      <p className="text-fg-muted">{t('take.submitted.note')}</p>
      <Link to="/take" className={buttonClass('primary')}>
        {t('take.backToList')}
      </Link>
    </main>
  );
}
