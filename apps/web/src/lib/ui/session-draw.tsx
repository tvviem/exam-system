import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { examQuery } from '../exams';
import { type DrawPlan, type DrawSection, sessionDrawPlanOf } from '../session-draw';
import type { DrawScope } from '../session-variants';
import { Button } from '.';

const fmt = (n: number) => String(n).replace('.', ',');

/** Các Phần của Bộ đề đã chọn (mặc định rút và điểm từng câu); `null` khi chưa chọn Bộ đề hoặc đang nạp. */
export function useDrawSections(examId: string): DrawSection[] | null {
  const exam = useQuery({ ...examQuery(examId), enabled: examId !== '' });
  if (!exam.data) return null;
  return exam.data.sections.map((section) => ({
    id: section.id,
    title: section.title,
    defaultPercent: section.drawPercent ?? 100,
    points: section.items.map((item) => item.points),
  }));
}

/** Một câu mô tả kế hoạch rút của Phiên thi, dùng ở khối form và ở phần tóm tắt. */
export function drawCountText(
  t: (key: string, options?: Record<string, unknown>) => string,
  plan: DrawPlan,
) {
  return plan.maxPoints === null
    ? t('session.draw.summaryCount', { count: plan.count })
    : t('session.draw.summary', { count: plan.count, points: fmt(plan.maxPoints) });
}

/**
 * Rút câu theo Phần ở form Phiên thi (Q438): kế thừa tỷ lệ mặc định của Bộ đề; "Thay đổi cho Phiên thi này" mở bảng ghi đè từng
 * Phần. Khóa khi đã có Lượt làm bài đầu tiên. Cảnh báo lệch điểm và mọi Phần 0 % lấy từ cùng hàm thuần với server.
 */
export function SessionDrawBlock({
  examId,
  overrides,
  scope,
  locked,
  onChange,
}: {
  examId: string;
  overrides: Record<string, string>;
  /** Cách ra đề của Phiên thi: quyết định luật lệch điểm (Q469). */
  scope: DrawScope;
  locked: boolean;
  onChange: (overrides: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const sections = useDrawSections(examId);
  const [open, setOpen] = useState(false);
  if (examId === '') return null;
  if (!sections) {
    return (
      <p className="text-sm text-fg-muted" aria-busy="true">
        {t('session.draw.loading')}
      </p>
    );
  }
  const plan = sessionDrawPlanOf(sections, overrides, scope);
  const drawing = plan.rows.filter((row) => row.percent < 100);
  const touched = Object.keys(overrides).length > 0;
  const split = sections.length > 1;
  const name = (row: DrawPlan['rows'][number], index: number) =>
    row.title?.trim() || t('exam.untitled', { n: index + 1 });
  const lead =
    drawing.length === 0
      ? t('session.draw.leadAll', { count: plan.count })
      : t(plan.hasOverrides ? 'session.draw.leadChanged' : 'session.draw.leadInherited', {
          list: drawing
            .map((row) =>
              `${split ? name(row, plan.rows.indexOf(row)) : ''} ${fmt(row.percent)} %`.trim(),
            )
            .join(', '),
        });

  return (
    <section
      data-testid="session-draw"
      aria-labelledby="session-draw-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4"
    >
      <h3 id="session-draw-title" className="text-base font-semibold">
        {t('session.draw.title')}
      </h3>
      <p className="text-sm text-fg-muted">{lead}</p>
      <p className="text-sm" data-testid="session-draw-summary" aria-live="polite">
        {drawCountText(t, plan)}
      </p>

      {plan.problems.some((p) => p.code === 'draw_all_zero') && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t('session.draw.allZero')}</span>
        </p>
      )}

      {locked ? (
        <p className="text-sm text-fg-muted" data-testid="session-draw-locked">
          {t('session.draw.locked')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('session.draw.hide') : t('session.draw.change')}
          </Button>
          {touched && (
            <Button
              onClick={() => {
                onChange({});
                // Về lại tỷ lệ của Bộ đề thì không còn gì để chỉnh: thu gọn bảng.
                setOpen(false);
              }}
            >
              {t('session.draw.reset')}
            </Button>
          )}
        </div>
      )}

      {open && !locked && (
        <ul className="flex flex-col gap-3" aria-label={t('session.draw.listLabel')}>
          {plan.rows.map((row, index) => {
            const label = name(row, index);
            const hintId = `session-draw-hint-${row.id}`;
            return (
              <li
                key={row.id}
                data-testid="session-draw-row"
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{label}</span>
                  <span className="text-sm text-fg-muted tabular-nums">
                    {t('session.draw.have', { count: row.total })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label htmlFor={`session-draw-${row.id}`} className="text-sm">
                    {t('session.draw.percentLabel')}
                  </label>
                  <span className="flex items-center gap-1.5">
                    <input
                      id={`session-draw-${row.id}`}
                      type="text"
                      inputMode="decimal"
                      aria-label={t('session.draw.inputLabel', { name: label })}
                      aria-describedby={hintId}
                      aria-invalid={!row.valid}
                      value={overrides[row.id] ?? fmt(row.defaultPercent)}
                      onChange={(e) => onChange({ ...overrides, [row.id]: e.target.value })}
                      className="h-12 w-24 rounded-lg border border-border-strong bg-surface px-3 text-right text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-10"
                    />
                    <span aria-hidden className="text-sm text-fg-muted">
                      %
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted tabular-nums" aria-live="polite">
                    {t('session.draw.result', { count: row.count, total: row.total })}
                  </span>
                </div>
                <p id={hintId} className="text-xs text-fg-muted">
                  {row.valid ? (
                    row.changed ? (
                      t('session.draw.changedFrom', { percent: fmt(row.defaultPercent) })
                    ) : (
                      t('session.draw.inherited', { percent: fmt(row.defaultPercent) })
                    )
                  ) : (
                    <span className="text-danger">{t('session.draw.invalid')}</span>
                  )}
                </p>
                {row.uneven && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span>{t('session.draw.uneven')}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
