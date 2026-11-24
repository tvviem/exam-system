import { useTranslation } from 'react-i18next';
import type { ExamOverview } from '../exam-overview';
import { Card } from '.';

const fmt = (n: number) => String(n).replace('.', ',');

/** Một ô số lớn của thẻ tổng quan. */
function Tile({
  value,
  label,
  note,
  testId,
  highlight = false,
}: {
  value: string;
  label: string;
  note?: string;
  testId?: string;
  highlight?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex min-w-0 flex-col gap-0.5 rounded-xl border p-3 ${
        highlight
          ? 'col-span-2 border-primary bg-primary-soft text-on-primary-soft sm:col-span-1'
          : 'border-border bg-surface'
      }`}
    >
      <span className={`font-semibold tabular-nums ${highlight ? 'text-3xl' : 'text-2xl'}`}>
        {value}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {note && <span className="text-xs wrap-anywhere opacity-80">{note}</span>}
    </div>
  );
}

/**
 * Thẻ tổng quan đầu trang Bộ đề đã phát hành: hàng ô số lớn (tổng câu, tổng điểm, **mỗi người nhận**, tỷ lệ rút chung, số Phần) và
 * bảng các Phần với tỷ lệ rút, số câu nhận, điểm. Bấm một Phần để nhảy tới Phần đó; Phần đang xem được tô đậm.
 */
export function ExamOverviewCard({
  overview,
  viewing,
  onJump,
}: {
  overview: ExamOverview;
  /** Vị trí (từ 0) của Phần đang xem khi cuộn. */
  viewing: number;
  onJump: (key: string) => void;
}) {
  const { t } = useTranslation();
  const { perPerson } = overview;
  return (
    <Card className="flex flex-col gap-4" data-testid="exam-overview">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          value={String(overview.totalItems)}
          label={t('exam.overview.items')}
          testId="overview-items"
        />
        <Tile
          value={fmt(overview.totalPoints)}
          label={t('exam.overview.points')}
          testId="overview-points"
        />
        <Tile
          highlight
          testId="draw-summary"
          value={t('exam.overview.perPersonValue', { count: perPerson.count })}
          label={t(overview.drawing ? 'exam.overview.perPerson' : 'exam.overview.perPersonAll')}
          note={
            perPerson.maxPoints === null
              ? t('exam.overview.perPersonPointsUnknown')
              : t('exam.overview.perPersonPoints', { points: fmt(perPerson.maxPoints) })
          }
        />
        <Tile
          value={overview.drawing ? `${fmt(overview.overallPercent)} %` : '100 %'}
          label={t('exam.overview.ratio')}
          note={overview.drawing ? undefined : t('exam.overview.ratioNone')}
          testId="overview-ratio"
        />
        <Tile
          value={String(overview.sectionCount)}
          label={t('exam.overview.sections')}
          testId="overview-sections"
        />
      </div>

      {overview.sectionCount > 1 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t('exam.overview.tableLabel')}</p>
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,1fr)_4.5rem_5rem_4.5rem_4.5rem] gap-3 px-3 text-xs text-fg-muted sm:grid"
          >
            <span>{t('exam.overview.colSection')}</span>
            <span className="text-right">{t('exam.overview.colTotal')}</span>
            <span className="text-right">{t('exam.overview.colRatio')}</span>
            <span className="text-right">{t('exam.overview.colTake')}</span>
            <span className="text-right">{t('exam.overview.colPoints')}</span>
          </div>
          <ul className="flex flex-col gap-1" data-testid="overview-sections-list">
            {overview.sections.map((section, index) => {
              const points = section.points === null ? '—' : fmt(section.points);
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    aria-current={index === viewing ? 'location' : undefined}
                    aria-label={t('exam.overview.jump', { name: section.name })}
                    data-testid="overview-section"
                    onClick={() => onJump(section.key)}
                    className={`flex min-h-12 w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left sm:grid sm:min-h-10 sm:grid-cols-[minmax(0,1fr)_4.5rem_5rem_4.5rem_4.5rem] sm:items-center sm:gap-3 ${
                      index === viewing
                        ? 'border-primary bg-primary-soft font-semibold text-on-primary-soft'
                        : 'border-border bg-surface hover:bg-primary-soft'
                    }`}
                  >
                    <span className="min-w-0 break-words">{section.name}</span>
                    {/* Điện thoại: một dòng nhỏ tóm tắt; từ sm trở lên là các cột. */}
                    <span className="text-xs text-fg-muted sm:hidden">
                      {t('exam.overview.rowStats', {
                        total: section.total,
                        percent: fmt(section.percent),
                        count: section.count,
                        points,
                      })}
                    </span>
                    <span className="hidden text-right tabular-nums sm:inline">
                      {section.total}
                    </span>
                    <span className="hidden text-right tabular-nums sm:inline">
                      {fmt(section.percent)} %
                    </span>
                    <span className="hidden text-right tabular-nums sm:inline">
                      {section.count}
                    </span>
                    <span className="hidden text-right tabular-nums sm:inline">{points}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
