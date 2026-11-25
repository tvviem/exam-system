import type { QuestionInput } from '@exam/shared';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RichTextView } from './rich-text-view';

// Hiển thị Câu hỏi đúng như Người dự thi sẽ thấy (docs/plan/slice-2.md, Q120). Dùng chung với trình soạn;
// khu làm bài và Xem thử Bộ đề dùng lại ở các lát cắt sau. `showAnswer` chỉ bật ở nơi chủ sở hữu xem.

export type QuestionViewData = Pick<QuestionInput, 'type' | 'stem' | 'payload' | 'defaultPoints'>;

const LETTERS = 'ABCDEFGH';

export function QuestionView({
  question,
  showAnswer = false,
  compact = false,
}: {
  question: QuestionViewData;
  showAnswer?: boolean;
  /** Gọn: bỏ dòng điểm (nơi gọi đã nêu) và đánh dấu đáp án đúng bằng dấu ✓ kèm chú thích khi rê chuột, ít chiếm chỗ. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <article className={`flex min-w-0 flex-col break-words ${compact ? 'gap-3' : 'gap-4'}`}>
      {!compact && (
        <p className="text-sm text-fg-muted">
          {t('questionBank.points', { points: question.defaultPoints })}
        </p>
      )}
      <RichTextView doc={question.stem} className="text-base" />
      <Answers question={question} showAnswer={showAnswer} compact={compact} />
    </article>
  );
}

function Answers({
  question,
  showAnswer,
  compact,
}: {
  question: QuestionViewData;
  showAnswer: boolean;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const q = question as QuestionInput;
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const multiple = q.type === 'multiple_choice';
    return (
      <>
        {multiple && <p className="text-sm text-fg-muted">{t('questionBank.chooseMany')}</p>}
        <ol className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {q.payload.options.map((option, index) => {
            const correct = showAnswer && q.payload.key.includes(option.id);
            return (
              <li
                key={option.id}
                data-correct={correct || undefined}
                title={correct ? t('questionBank.correctAnswer') : undefined}
                className={`flex items-start rounded-lg border ${compact ? 'gap-2 px-2.5 py-1.5' : 'gap-3 p-3'} ${
                  correct ? 'border-success bg-success-soft' : 'border-border bg-surface'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center border border-border-strong text-xs font-semibold ${
                    multiple ? 'rounded' : 'rounded-full'
                  }`}
                >
                  {LETTERS[index]}
                </span>
                <RichTextView doc={option.content} className="min-w-0 flex-1" />
                {correct &&
                  (compact ? (
                    <span className="inline-flex items-center text-success">
                      <Check aria-hidden className="size-5" />
                      <span className="sr-only">{t('questionBank.correctAnswer')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                      <Check aria-hidden className="size-4" />
                      {t('questionBank.correctAnswer')}
                    </span>
                  ))}
              </li>
            );
          })}
        </ol>
      </>
    );
  }
  if (q.type === 'true_false_cluster') {
    return (
      <ol className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {q.payload.statements.map((statement, index) => (
          <li
            key={statement.id}
            className={`flex flex-wrap items-start rounded-lg border border-border bg-surface ${compact ? 'gap-2 px-2.5 py-1.5' : 'gap-3 p-3'}`}
          >
            <span aria-hidden className="mt-0.5 w-6 shrink-0 text-sm font-semibold">
              {String.fromCharCode(97 + index)})
            </span>
            <RichTextView doc={statement.content} className="min-w-48 flex-1" />
            {showAnswer ? (
              <span
                className={`inline-flex items-center gap-1 text-sm font-medium ${statement.key ? 'text-success' : 'text-danger'}`}
              >
                {statement.key ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <X aria-hidden className="size-4" />
                )}
                {statement.key ? t('questionBank.true') : t('questionBank.false')}
              </span>
            ) : (
              <span className="text-sm text-fg-muted">
                {t('questionBank.true')} / {t('questionBank.false')}
              </span>
            )}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <>
      <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-fg-muted">
        {t('questionBank.essayBox', { max: q.payload.maxLength })}
      </p>
      {showAnswer && q.payload.rubric && (
        <div className="rounded-lg border border-success bg-success-soft p-3">
          <p className="mb-1 text-sm font-medium text-success">{t('questionBank.rubric')}</p>
          <RichTextView doc={q.payload.rubric} />
        </div>
      )}
    </>
  );
}
