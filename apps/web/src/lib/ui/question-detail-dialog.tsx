import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import type { PickedQuestion } from '../exam-draft';
import { pickerNeighbor, pickerPosition } from '../picker-nav';
import { questionQuery } from '../question-bank';
import { Badge, Button, Dialog, ErrorMessage } from '.';
import { ListSkeleton } from './admin';
import { QuestionView } from './question-view';

/**
 * "Chi tiết câu hỏi" trong hộp "Thêm câu hỏi vào Bộ đề": để Người ra đề xem kỹ một câu trước khi thêm. Gọn: một dòng thông tin
 * (loại, Chủ đề, điểm, thẻ), đề bài và phương án, đáp án đúng đánh dấu bằng màu và dấu ✓ (chú thích khi rê chuột, có chữ cho trình
 * đọc màn hình). Chỉ Người ra đề, câu của chính họ, nên hiện đáp án. ‹ › duyệt các câu của trang; Chọn / Bỏ chọn ngay trong hộp.
 */
export function QuestionDetailDialog({
  question,
  ids,
  chosen,
  already,
  canChoose,
  onToggle,
  onNavigate,
  onClose,
}: {
  /** Câu đang xem; `null` là đóng. */
  question: PickedQuestion | null;
  /** Mã các câu của trang đang xem trong hộp, theo thứ tự, để duyệt ‹ ›. */
  ids: readonly string[];
  chosen: boolean;
  /** Câu đã có trong Bộ đề. */
  already: boolean;
  /** Còn chỗ để chọn thêm (Bộ đề có giới hạn số câu). */
  canChoose: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const detail = useQuery({
    ...questionQuery(question?.id ?? ''),
    enabled: question !== null,
  });
  const id = question?.id ?? '';
  const previous = pickerNeighbor(ids, id, -1);
  const next = pickerNeighbor(ids, id, 1);
  const position = pickerPosition(ids, id);
  const tags = question?.tags ?? [];

  return (
    <Dialog
      open={question !== null}
      onClose={onClose}
      title={t('exam.picker.detail.title')}
      size="xl"
    >
      {question && (
        <div className="flex flex-col gap-3" data-testid="picker-detail">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-fg-muted">
              {t(`questionType.${question.type}`)} · {question.topicName} ·{' '}
              {t('questionBank.points', { points: question.defaultPoints })}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                aria-label={t('exam.picker.detail.previous')}
                title={t('exam.picker.detail.previous')}
                disabled={previous === null}
                onClick={() => previous && onNavigate(previous)}
              >
                <ChevronLeft aria-hidden className="size-5" />
              </Button>
              {position && (
                <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">
                  {t('exam.picker.detail.position', position)}
                </span>
              )}
              <Button
                aria-label={t('exam.picker.detail.next')}
                title={t('exam.picker.detail.next')}
                disabled={next === null}
                onClick={() => next && onNavigate(next)}
              >
                <ChevronRight aria-hidden className="size-5" />
              </Button>
            </div>
          </div>

          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t('exam.picker.detail.tags')}>
              {tags.map((tag) => (
                <li key={tag}>
                  <Badge>{tag}</Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="max-h-[55vh] overflow-y-auto">
            {detail.isPending ? (
              <ListSkeleton rows={3} />
            ) : detail.isError ? (
              <ErrorMessage>{errorMessage(t, detail.error)}</ErrorMessage>
            ) : (
              <QuestionView question={detail.data} showAnswer compact />
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
            <Button onClick={onClose}>{t('exam.picker.detail.back')}</Button>
            <Button
              variant={chosen ? 'secondary' : 'primary'}
              disabled={already || (!chosen && !canChoose)}
              aria-pressed={chosen}
              onClick={onToggle}
            >
              {chosen && <Check aria-hidden className="size-5" />}
              {already
                ? t('exam.picker.already')
                : chosen
                  ? t('exam.picker.detail.unchoose')
                  : t('exam.picker.detail.choose')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
