import { type CandidateView, plainTextOf } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import { examPreviewQuery } from '../exams';
import { Badge, Card, ErrorMessage } from '.';
import { ListSkeleton } from './admin';
import { QuestionView, type QuestionViewData } from './question-view';
import { RichTextView } from './rich-text-view';

/**
 * Tab Xem thử (Q169): bản chỉ đọc như Người dự thi sẽ thấy, không có Đáp án. Dữ liệu do server làm sạch;
 * chỉ hiện bản ĐÃ LƯU, nên báo khi còn thay đổi chưa lưu.
 */
export function ExamPreview({
  examId,
  active,
  dirty,
}: {
  examId: string;
  active: boolean;
  dirty: boolean;
}) {
  const { t } = useTranslation();
  const [showRules, setShowRules] = useState(false);
  const preview = useQuery({
    ...examPreviewQuery(examId, showRules),
    enabled: active,
    staleTime: 0,
  });

  return (
    <div className="flex flex-col gap-4">
      {dirty && (
        <p role="status" className="rounded-lg border border-warning bg-warning-soft p-3 text-sm">
          {t('exam.preview.unsaved')}
        </p>
      )}
      <label className="flex min-h-12 items-center gap-2 text-sm pointer-fine:min-h-9">
        <input
          type="checkbox"
          className="size-5"
          checked={showRules}
          onChange={(e) => setShowRules(e.target.checked)}
        />
        {t('exam.preview.showRules')}
      </label>
      <p className="text-sm text-fg-muted">{t('exam.preview.rulesHint')}</p>

      {preview.isPending ? (
        <ListSkeleton rows={3} />
      ) : preview.isError ? (
        <ErrorMessage>{errorMessage(t, preview.error)}</ErrorMessage>
      ) : (
        <section className="flex flex-col gap-4" aria-label={t('exam.preview.content')}>
          <Card className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{preview.data.title}</h2>
            {plainTextOf(preview.data.instructions) !== '' && (
              <RichTextView doc={preview.data.instructions} />
            )}
            <p className="text-sm text-fg-muted">
              {t('exam.totals', {
                items: preview.data.totals.items,
                points: String(preview.data.totals.points).replace('.', ','),
              })}
            </p>
          </Card>
          {preview.data.sections.map((section, index) => (
            <Card key={section.id} className="flex flex-col gap-4">
              {(preview.data.sections.length > 1 ||
                section.title ||
                plainTextOf(section.instructions) !== '') && (
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">
                    {section.title || t('exam.untitled', { n: index + 1 })}
                  </h3>
                  {plainTextOf(section.instructions) !== '' && (
                    <RichTextView doc={section.instructions} />
                  )}
                </div>
              )}
              {section.items.length === 0 && (
                <p className="text-fg-muted">{t('exam.emptySection')}</p>
              )}
              {section.items.map((item) => (
                <div
                  key={item.questionId}
                  className="flex flex-col gap-2 border-t border-border pt-4"
                >
                  <span className="text-sm font-semibold text-fg-muted">
                    {t('exam.numberN', { n: item.number })}
                  </span>
                  <QuestionView
                    question={{ ...item.question, defaultPoints: item.points } as QuestionViewData}
                  />
                  <Rules view={item.question} />
                </div>
              ))}
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

/** Quy tắc chấm chỉ có khi công tắc bật (server mới gửi). */
function Rules({ view }: { view: CandidateView }) {
  const { t } = useTranslation();
  if (view.type === 'essay' || !view.payload.scoringRule) return null;
  const { scoringRule } = view.payload;
  const ladder = view.type === 'true_false_cluster' ? view.payload.ladder : undefined;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
      <Badge tone="primary">{t(`questionBank.rule.${scoringRule}`)}</Badge>
      {ladder?.map((v) => `${Math.round(v * 100)}%`).join(' · ')}
    </p>
  );
}
