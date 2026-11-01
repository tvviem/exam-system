import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api';
import { errorMessage } from '../errors';
import type { ExamDraft } from '../exam-draft';
import { type ExamDetail, publishCheckQuery, publishExam } from '../exams';
import { Button, Dialog, ErrorMessage, PrimaryButton } from '.';
import { ListSkeleton } from './admin';
import { useToast } from './toast';

/**
 * Hộp thoại Phát hành (Q187): chạy kiểm tra trước; có vấn đề thì liệt kê, không thì nhắc rằng Phát hành xong
 * không sửa được (muốn đổi thì Nhân bản). Chỉ mở khi bản nháp đã lưu.
 */
export function ExamPublishDialog({
  open,
  exam,
  draft,
  sectionName,
  onClose,
}: {
  open: boolean;
  exam: ExamDetail;
  draft: ExamDraft;
  sectionName: (index: number) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const check = useQuery({ ...publishCheckQuery(exam.id), enabled: open, staleTime: 0, gcTime: 0 });

  const publish = useMutation({
    mutationFn: () => publishExam(exam.id, exam.version),
    onSuccess: () => {
      toast(t('exam.publish.done'));
      onClose();
      // Bộ đề đã đổi trạng thái: nạp lại để trang soạn chuyển sang chế độ chỉ đọc.
      queryClient.removeQueries({ queryKey: publishCheckQuery(exam.id).queryKey });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
  });

  const items = draft.sections.flatMap((s) => s.items);
  const labelOf = (problem: { questionId?: string; sectionId?: string }) => {
    const item = items.find((i) => i.questionId === problem.questionId);
    if (item) return item.question.preview;
    const index = draft.sections.findIndex((s) => s.id === problem.sectionId);
    return index >= 0 ? sectionName(index) : '';
  };
  const problems = check.data?.problems ?? [];
  const blocked =
    publish.error instanceof ApiError && publish.error.details.reason === 'PUBLISH_BLOCKED';

  return (
    <Dialog open={open} onClose={onClose} title={t('exam.publish.title')}>
      {check.isPending ? (
        <ListSkeleton rows={2} />
      ) : check.isError ? (
        <ErrorMessage>{errorMessage(t, check.error)}</ErrorMessage>
      ) : problems.length > 0 ? (
        <>
          <p>{t('exam.publish.problems')}</p>
          <ul className="flex flex-col gap-2">
            {problems.map((problem) => (
              <li
                key={`${problem.code}-${problem.questionId ?? problem.sectionId ?? ''}`}
                className="rounded-lg border border-danger bg-danger-soft p-3 text-sm"
              >
                <span className="font-medium">{t(`exam.publish.problem.${problem.code}`)}</span>
                {labelOf(problem) && (
                  <span className="line-clamp-2 break-words text-fg-muted">{labelOf(problem)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p>
            {t('exam.publish.summary', {
              title: exam.title,
              items: exam.totals.items,
              points: String(exam.totals.points).replace('.', ','),
            })}
          </p>
          <p role="alert" className="rounded-lg border border-warning bg-warning-soft p-3 text-sm">
            {t('exam.publish.warning')}
          </p>
        </>
      )}
      <ErrorMessage>
        {publish.isError && (blocked ? t('exam.publish.blocked') : errorMessage(t, publish.error))}
      </ErrorMessage>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton
          disabled={!check.isSuccess || problems.length > 0 || publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? t('exam.publish.publishing') : t('exam.publish.confirm')}
        </PrimaryButton>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
