import { resultBandOf } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, Gauge, ThumbsUp, Trophy } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import { type MyResult, type MyResultItem, myResultQuery } from '../../grading';
import { Badge, ErrorMessage } from '..';
import { ListSkeleton } from '../admin';
import { RichTextView } from '../rich-text-view';
import { BAND_STYLE } from './result-band';

// Màn "Kết quả của tôi" (PR 5c; Q297): khối điểm tô màu theo mức đạt, rồi từng câu theo thứ tự Người dự thi đã thấy.

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('vi-VN', { maximumFractionDigits: digits });

const BAND_ICON: Record<
  ReturnType<typeof resultBandOf>,
  ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
> = {
  low: CircleAlert,
  fair: Gauge,
  good: ThumbsUp,
  excellent: Trophy,
};

export function MyResultScreen({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const result = useQuery(myResultQuery(sessionId));
  if (result.isPending) return <ListSkeleton rows={4} />;
  if (result.isError) return <ErrorMessage>{errorMessage(t, result.error)}</ErrorMessage>;
  return <ResultView data={result.data} />;
}

export function ResultView({ data }: { data: MyResult }) {
  const { t } = useTranslation();
  const { summary } = data;
  const band = resultBandOf(summary.percent);
  const style = BAND_STYLE[band];
  const Icon = BAND_ICON[band];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{data.session.title}</h1>
        <p className="text-sm text-fg-muted">
          {t('myResult.releasedAt', { time: formatDateTime(data.releasedAt) })}
          {data.attemptCount > 1 && data.countedAttemptNo
            ? ` · ${t('myResult.countedAttempt', { no: data.countedAttemptNo })}`
            : ''}
        </p>
      </div>

      <section
        data-testid="result-hero"
        data-band={band}
        aria-label={t('myResult.heroLabel')}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center shadow-sm ${style.hero}`}
      >
        <ScoreRing percent={summary.percent} style={style}>
          <span className="text-5xl leading-none font-bold tabular-nums">
            {fmt(summary.scaledScore, 1)}
          </span>
          <span className={`text-sm ${style.muted}`}>{t('myResult.scaleHint')}</span>
        </ScoreRing>
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className="size-6" />
          {t(`myResult.band.${band}`)}
        </p>
        <dl className={`grid grid-cols-2 gap-x-6 gap-y-1 text-sm ${style.muted}`}>
          <dt>{t('myResult.raw')}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {fmt(summary.rawScore)}/{fmt(summary.maxScore)}
          </dd>
          {(summary.penaltyPercent > 0 || summary.voided) && (
            <>
              <dt>{t('myResult.afterPenalty')}</dt>
              <dd className="text-right font-semibold tabular-nums">{fmt(summary.finalScore)}</dd>
            </>
          )}
          <dt>{t('myResult.percent')}</dt>
          <dd className="text-right font-semibold tabular-nums">{fmt(summary.percent, 1)}%</dd>
        </dl>
      </section>

      {data.penalties.length > 0 && (
        <section className="flex flex-col gap-1 rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <h2 className="font-semibold">{t('myResult.penaltyTitle')}</h2>
          <ul className="flex flex-col gap-1">
            {data.penalties.map((p) => (
              <li key={`${p.action}-${p.reason}`}>
                {t(`grading.violation.${p.action}`)}: {p.reason} ·{' '}
                {p.type === 'void'
                  ? t('grading.penalty.void')
                  : t('grading.penalty.percent', { percent: fmt(p.percent) })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="my-items">
        <h2 id="my-items" className="text-base font-semibold">
          {t('myResult.items')}
        </h2>
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <ItemRow key={item.no} item={item} />
          ))}
        </ul>
      </section>

      <p className="text-sm text-fg-muted">
        {data.appealUntil
          ? t('myResult.appealUntil', { time: formatDateTime(data.appealUntil) })
          : t('myResult.noAppeal')}
      </p>
    </div>
  );
}

/** Vòng điểm: nét đầy theo phần trăm đạt, màu theo dải. */
function ScoreRing({
  percent,
  style,
  children,
}: {
  percent: number;
  style: (typeof BAND_STYLE)[keyof typeof BAND_STYLE];
  children: React.ReactNode;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <div className="relative size-40" role="img" aria-label={`${fmt(percent, 1)}%`}>
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={radius} fill="none" strokeWidth="10" className={style.track} />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={`${style.stroke} motion-safe:transition-[stroke-dasharray] motion-safe:duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

const VERDICT_TONE = {
  correct: 'success',
  partial: 'warning',
  wrong: 'danger',
  blank: 'neutral',
} as const;

function ItemRow({ item }: { item: MyResultItem }) {
  const { t } = useTranslation();
  const detail = item.essay ?? item.review;
  return (
    <li className="rounded-xl border border-border bg-surface">
      <details className="group">
        <summary
          className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 p-3 ${detail ? '' : 'pointer-events-none'}`}
        >
          <span className="min-w-0">
            <span className="font-medium">{t('grading.person.item', { no: item.no })}</span>
            <span className="block text-sm text-fg-muted">
              {t(`grading.type.${item.type}`)}
              {item.cluster ? ` · ${t('myResult.cluster', item.cluster)}` : ''}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums">
              {fmt(item.score)}/{fmt(item.points)}
            </span>
            <Badge tone={VERDICT_TONE[item.verdict]}>{t(`grading.verdict.${item.verdict}`)}</Badge>
            {detail && (
              <ChevronDown
                aria-hidden
                className="size-4 text-fg-muted transition-transform group-open:rotate-180"
              />
            )}
          </span>
        </summary>
        {detail && (
          <div className="flex flex-col gap-2 border-t border-border p-3 text-sm">
            {item.review && (
              <div>
                <RichTextView doc={item.review.stem} />
                <ReviewAnswer item={item} />
              </div>
            )}
            {item.essay && (
              <>
                <p className="font-medium">{t('myResult.yourAnswer')}</p>
                <p className="rounded-lg bg-bg p-3 whitespace-pre-wrap break-words">
                  {item.essay.answer || t('grading.emptyAnswer')}
                </p>
                {item.essay.feedback && (
                  <p className="rounded-lg bg-primary-soft p-3 text-on-primary-soft">
                    <span className="font-medium">{t('myResult.feedback')}: </span>
                    {item.essay.feedback}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </details>
    </li>
  );
}

/** Lựa chọn của chính Người dự thi (không có đáp án đúng): chỉ đánh dấu những gì họ đã chọn. */
function ReviewAnswer({ item }: { item: MyResultItem }) {
  const { t } = useTranslation();
  const review = item.review;
  if (!review) return null;
  const options = (review.payload.options ?? review.payload.statements) as
    | { id: string; content: Parameters<typeof RichTextView>[0]['doc'] }[]
    | undefined;
  if (!options) return null;
  const answer = review.answer as {
    optionId?: string;
    optionIds?: string[];
    answers?: Record<string, boolean>;
  } | null;
  const chosen = new Set(answer?.optionId ? [answer.optionId] : (answer?.optionIds ?? []));
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {options.map((option) => {
        const said = answer?.answers?.[option.id];
        const mine = chosen.has(option.id) || said !== undefined;
        return (
          <li
            key={option.id}
            className={`rounded-lg border px-3 py-2 ${mine ? 'border-primary bg-primary-soft text-on-primary-soft' : 'border-border'}`}
          >
            <RichTextView doc={option.content} />
            {said !== undefined && (
              <span className="text-xs font-medium">
                {said ? t('myResult.saidTrue') : t('myResult.saidFalse')}
              </span>
            )}
            {chosen.has(option.id) && (
              <span className="text-xs font-medium">{t('myResult.yourChoice')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
