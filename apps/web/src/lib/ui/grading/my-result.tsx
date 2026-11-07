import { resultBandOf } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Gauge, ThumbsUp, Trophy } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import { type MyResult, myResultQuery } from '../../grading';
import { ErrorMessage } from '..';
import { ListSkeleton } from '../admin';
import { BAND_STYLE } from './result-band';
import { ResultReview } from './result-review';

// Màn "Kết quả của tôi" (PR 5c; Q297): khối điểm tô màu theo mức đạt, rồi duyệt từng câu theo thứ tự Người dự thi đã thấy (Q318).

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

export function MyResultScreen({
  sessionId,
  currentNo,
  onCurrentNo,
}: {
  sessionId: string;
  /** Câu đang xem, lấy từ địa chỉ (`?cau=`); không truyền thì giữ trong bộ nhớ của màn. */
  currentNo?: number;
  onCurrentNo?: (no: number) => void;
}) {
  const { t } = useTranslation();
  const result = useQuery(myResultQuery(sessionId));
  if (result.isPending) return <ListSkeleton rows={4} />;
  if (result.isError) return <ErrorMessage>{errorMessage(t, result.error)}</ErrorMessage>;
  return <ResultView data={result.data} currentNo={currentNo} onCurrentNo={onCurrentNo} />;
}

export function ResultView({
  data,
  currentNo,
  onCurrentNo,
}: {
  data: MyResult;
  currentNo?: number;
  onCurrentNo?: (no: number) => void;
}) {
  const { t } = useTranslation();
  const [localNo, setLocalNo] = useState<number | undefined>(currentNo);
  const { summary } = data;
  const band = resultBandOf(summary.percent);
  const style = BAND_STYLE[band];
  const Icon = BAND_ICON[band];
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="mx-auto w-full max-w-2xl">
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
        className={`mx-auto flex w-full max-w-2xl flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center shadow-sm ${style.hero}`}
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
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-1 rounded-xl border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <h2 className="font-semibold">{t('myResult.penaltyTitle')}</h2>
          <ul className="flex flex-col gap-1">
            {data.penalties.map((p) => (
              <li key={`${p.action}-${p.reason}-${p.type}`}>
                {t(`grading.violation.${p.action}`)}: {p.reason} ·{' '}
                {p.type === 'void'
                  ? t('grading.penalty.void')
                  : t('grading.penalty.percent', { percent: fmt(p.percent) })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ResultReview
        items={data.items}
        currentNo={onCurrentNo ? currentNo : localNo}
        onCurrentNo={onCurrentNo ?? setLocalNo}
      />

      <p className="mx-auto w-full max-w-2xl text-sm text-fg-muted">
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
    <div className="relative size-40">
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
      <span className="sr-only">{`${fmt(percent, 1)}%`}</span>
    </div>
  );
}
