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
}: {
  question: QuestionViewData;
  showAnswer?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">
        {t('questionBank.points', { points: question.defaultPoints })}
      </p>
      <RichTextView doc={question.stem} className="text-base" />
      <Answers question={question} showAnswer={showAnswer} />
    </article>
  );
}

function Answers({ question, showAnswer }: { question: QuestionViewData; showAnswer: boolean }) {
  const { t } = useTranslation();
  const q = question as QuestionInput;
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    const multiple = q.type === 'multiple_choice';
    return (
      <>
        {multiple && <p className="text-sm text-fg-muted">{t('questionBank.chooseMany')}</p>}
        <ol className="flex flex-col gap-2">
          {q.payload.options.map((option, index) => {
            const correct = showAnswer && q.payload.key.includes(option.id);
            return (
              <li
                key={option.id}
                className={`flex items-start gap-3 rounded-lg border p-3 ${
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
                <RichTextView doc={option.content} className="flex-1" />
                {correct && (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                    <Check aria-hidden className="size-4" />
                    {t('questionBank.correctAnswer')}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </>
    );
  }
  if (q.type === 'true_false_cluster') {
    return (
      <ol className="flex flex-col gap-2">
        {q.payload.statements.map((statement, index) => (
          <li
            key={statement.id}
            className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-surface p-3"
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
