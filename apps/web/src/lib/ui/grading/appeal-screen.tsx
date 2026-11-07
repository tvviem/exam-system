import type { RichText } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AppealDetail,
  type AppealRow,
  appealDetailQuery,
  appealsQuery,
  resolveAppeal,
} from '../../appeals';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import type { PenaltyInput } from '../../grading';
import { Badge, Button, ErrorMessage, PrimaryButton } from '..';
import { ListSkeleton } from '../admin';
import { QuestionView, type QuestionViewData } from '../question-view';
import { RichTextView } from '../rich-text-view';
import { useToast } from '../toast';
import { appealValueText } from './appeal-box';
import { appealSubject } from './appeals-panel';
import { KeyCorrectionDialog } from './key-correction-dialog';

// Màn xử lý Phúc khảo của Người ra đề (docs/plan/slice-5.md, PR 5d-2; Q310, Q313): một Phúc khảo một màn như màn Chấm. Máy tính
// có danh sách bên trái; điện thoại đi bằng nút trước/sau. Phím J/K sang Phúc khảo kế tiếp/trước. Hiện tên Người dự thi (Phúc khảo
// do chính họ yêu cầu; Chấm ẩn tên chỉ áp cho vòng chấm đầu).

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;
const RESPONSE_MAX = 1000;
const QUICK = ['0', '¼', '½', '¾', 'max'] as const;

export function AppealScreen({
  sessionId,
  appealId,
  onAppeal,
  backTo,
}: {
  sessionId: string;
  appealId?: string;
  onAppeal: (id: string) => void;
  backTo: ReactNode;
}) {
  const { t } = useTranslation();
  const list = useQuery(appealsQuery(sessionId));
  const items = list.data?.items ?? [];
  const currentId = appealId ?? items.find((row) => row.status === 'open')?.id ?? items[0]?.id;
  const index = items.findIndex((row) => row.id === currentId);

  const go = (target: number) => {
    const row = items[target];
    if (row) onAppeal(row.id);
  };
  // J/K như màn Chấm; bỏ qua khi đang gõ.
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog[open]'))
        return;
      if (event.key === 'j' || event.key === 'J') goRef.current(indexRef.current + 1);
      else if (event.key === 'k' || event.key === 'K') goRef.current(indexRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (list.isPending) return <ListSkeleton rows={5} />;
  if (list.isError) return <ErrorMessage>{errorMessage(t, list.error)}</ErrorMessage>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {backTo}
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-fg-muted">
          {t('appeal.panel.empty')}
        </p>
      </div>
    );
  }
  const nextOpenAfter = (from: number) =>
    items.find((row, i) => i > from && row.status === 'open') ??
    items.find((row, i) => i !== from && row.status === 'open');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backTo}
        <p className="text-sm text-fg-muted tabular-nums" data-testid="appeal-progress">
          {t('appeal.screen.progress', {
            current: index + 1,
            total: items.length,
            open: list.data?.open ?? 0,
          })}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ul
          className="hidden max-h-[70vh] flex-col gap-1 overflow-y-auto lg:flex"
          aria-label={t('appeal.panel.title')}
        >
          {items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-current={row.id === currentId ? 'true' : undefined}
                onClick={() => onAppeal(row.id)}
                className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm ${
                  row.id === currentId
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:bg-primary-soft'
                }`}
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  <span className="truncate">{row.user.fullName}</span>
                  {row.status === 'resolved' && (
                    <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
                  )}
                </span>
                <span className="truncate text-fg-muted">{appealSubject(t, row)}</span>
              </button>
            </li>
          ))}
        </ul>
        {currentId && (
          <AppealDetailView
            key={currentId}
            sessionId={sessionId}
            appealId={currentId}
            row={items[index]}
            onResolved={() => {
              const next = nextOpenAfter(index);
              if (next) onAppeal(next.id);
            }}
          />
        )}
      </div>
      <nav
        aria-label={t('appeal.screen.nav')}
        className="sticky bottom-[var(--app-tabbar-h,0px)] z-30 flex items-center gap-2 border-t border-border bg-surface/95 py-2 backdrop-blur lg:hidden"
      >
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => go(index - 1)}
          className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border-strong bg-surface font-semibold disabled:cursor-default disabled:opacity-50"
        >
          <ArrowLeft aria-hidden className="size-5" />
          {t('appeal.screen.prev')}
        </button>
        <button
          type="button"
          disabled={index >= items.length - 1}
          onClick={() => go(index + 1)}
          className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-primary font-semibold text-on-primary disabled:cursor-default disabled:opacity-50"
        >
          {t('appeal.screen.next')}
          <ArrowRight aria-hidden className="size-5" />
        </button>
      </nav>
    </div>
  );
}

function AppealDetailView({
  sessionId,
  appealId,
  row,
  onResolved,
}: {
  sessionId: string;
  appealId: string;
  row: AppealRow | undefined;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const detail = useQuery(appealDetailQuery(sessionId, appealId));
  if (detail.isPending) return <ListSkeleton rows={4} />;
  if (detail.isError) return <ErrorMessage>{errorMessage(t, detail.error)}</ErrorMessage>;
  const data = detail.data;
  return (
    <article
      data-testid="appeal-detail"
      data-status={data.status}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {data.user.fullName}
            {data.user.code ? (
              <span className="font-normal text-fg-muted"> · {data.user.code}</span>
            ) : null}
          </h2>
          <p className="text-sm text-fg-muted" data-testid="appeal-subject">
            {row
              ? appealSubject(t, row)
              : data.target === 'penalty'
                ? t('appeal.penaltyLabel')
                : t('grading.person.item', { no: data.item?.no })}{' '}
            · {formatDateTime(data.createdAt)}
          </p>
        </div>
        <Badge tone={data.status === 'open' ? 'warning' : 'success'}>
          {t(`appeal.panel.status.${data.status}`)}
        </Badge>
      </header>

      <blockquote className="rounded-lg border-l-4 border-primary bg-primary-soft p-3 text-on-primary-soft">
        <p className="text-xs font-semibold uppercase">{t('appeal.screen.theirReason')}</p>
        <p className="whitespace-pre-wrap break-words">{data.reason}</p>
      </blockquote>

      {data.target === 'response' && data.item ? <ItemSection data={data} /> : null}
      {data.target === 'penalty' && data.violation ? (
        <section className="flex flex-col gap-1 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <p className="font-semibold">
            {t(`grading.violation.${data.violation.action}`)}: {data.violation.reason}
          </p>
          <p>
            {t('appeal.screen.currentPenalty')}:{' '}
            {appealValueText(t, {
              type: data.violation.penaltyType,
              percent: data.violation.penaltyPercent,
            })}
          </p>
        </section>
      ) : null}

      {data.status === 'resolved' ? (
        <section
          data-testid="appeal-resolved"
          className="flex flex-col gap-1 rounded-lg border border-success/50 bg-success-soft p-3 text-sm text-success"
        >
          <p className="font-semibold">{t('appeal.screen.resolvedTitle')}</p>
          <p className="text-fg">{data.response}</p>
          <p className="font-semibold tabular-nums">
            {t('appeal.change', {
              from: appealValueText(t, data.previousValue),
              to: appealValueText(t, data.newValue),
            })}
          </p>
        </section>
      ) : (
        <ResolveForm sessionId={sessionId} data={data} onResolved={onResolved} />
      )}
    </article>
  );
}

type Doc = { id: string; content: RichText };

/** Nội dung câu (có đáp án, vì đây là Người ra đề), bài làm của Người dự thi và điểm hiện tại. */
function ItemSection({ data }: { data: AppealDetail }) {
  const { t } = useTranslation();
  const [fixing, setFixing] = useState(false);
  const item = data.item;
  if (!item) return null;
  const question = {
    type: item.type,
    stem: item.stem,
    payload: item.payload,
    defaultPoints: item.points,
  } as unknown as QuestionViewData;
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('appeal.screen.question')}</h3>
        <QuestionView question={question} showAnswer />
      </section>
      <section className="flex flex-col gap-2" data-testid="appeal-answer">
        <h3 className="text-sm font-semibold">{t('appeal.screen.theirAnswer')}</h3>
        <AnswerView item={item} answer={data.answer} />
      </section>
      {/* Đính chính đã đổi điểm tự động của câu này sau khi Phúc khảo được gửi (Q316). */}
      {data.correction && (
        <p
          role="status"
          data-testid="appeal-correction"
          className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">{t('keyFix.warnTitle')}. </span>
            {t('keyFix.warnBody', {
              from: fmt(data.correction.oldScore),
              to: fmt(data.correction.newScore),
            })}
          </span>
        </p>
      )}
      {data.grade && (
        <p className="text-sm tabular-nums" data-testid="appeal-grade">
          {t('appeal.screen.currentScore', {
            score: fmt(data.grade.score),
            points: fmt(item.points),
            source: t(`appeal.screen.source.${data.grade.source}`),
          })}
        </p>
      )}
      {item.type !== 'essay' && data.status === 'open' && data.examId && data.itemId && (
        <div className="flex flex-col gap-1">
          {data.canCorrect ? (
            <>
              <Button
                className="w-fit"
                onClick={() => setFixing(true)}
                data-testid="appeal-fix-class"
              >
                {t('keyFix.viaAppeal')}
              </Button>
              <KeyCorrectionDialog
                examId={data.examId}
                itemId={data.itemId}
                open={fixing}
                onClose={() => setFixing(false)}
              />
            </>
          ) : (
            <p className="text-sm text-fg-muted" data-testid="appeal-ask-owner">
              {t('keyFix.askOwner')}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function AnswerView({
  item,
  answer,
}: {
  item: NonNullable<AppealDetail['item']>;
  answer: unknown;
}) {
  const { t } = useTranslation();
  const value = (answer ?? null) as {
    text?: string;
    optionId?: string;
    optionIds?: string[];
    answers?: Record<string, boolean>;
  } | null;
  if (item.type === 'essay') {
    return (
      <p className="rounded-lg bg-bg p-3 break-words whitespace-pre-wrap">
        {value?.text || t('grading.emptyAnswer')}
      </p>
    );
  }
  if (item.type === 'true_false_cluster') {
    const statements = (item.payload.statements ?? []) as Doc[];
    return (
      <ul className="flex flex-col gap-1">
        {statements.map((statement, i) => {
          const said = value?.answers?.[statement.id];
          return (
            <li key={statement.id} className="rounded-lg bg-bg p-2 text-sm">
              <span className="font-semibold">{String.fromCharCode(97 + i)}) </span>
              <RichTextView doc={statement.content} className="inline" />
              <span className="ml-2 font-semibold">
                {said === undefined
                  ? t('myResult.notAnswered')
                  : said
                    ? t('myResult.saidTrue')
                    : t('myResult.saidFalse')}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  const chosen = new Set(value?.optionId ? [value.optionId] : (value?.optionIds ?? []));
  const options = ((item.payload.options ?? []) as Doc[]).filter((o) => chosen.has(o.id));
  if (options.length === 0) {
    return <p className="rounded-lg bg-bg p-3 text-fg-muted">{t('myResult.notAnswered')}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {options.map((option) => (
        <li key={option.id} className="rounded-lg border border-primary bg-primary-soft p-2">
          <RichTextView doc={option.content} />
        </li>
      ))}
    </ul>
  );
}

/** Biểu mẫu xử lý: điểm mới (câu) hoặc Mức xử lý mới, kèm câu trả lời bắt buộc. */
function ResolveForm({
  sessionId,
  data,
  onResolved,
}: {
  sessionId: string;
  data: AppealDetail;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isResponse = data.target === 'response';
  const points = data.item?.points ?? 0;
  const currentScore = data.grade?.score ?? 0;
  const [score, setScore] = useState(String(currentScore));
  const currentPenalty: PenaltyInput = useMemo(() => {
    const v = data.violation;
    if (!v || v.penaltyType === 'none') return { type: 'none' };
    return v.penaltyType === 'void'
      ? { type: 'void' }
      : { type: 'percent', percent: v.penaltyPercent ?? 0 };
  }, [data.violation]);
  const [penaltyType, setPenaltyType] = useState<PenaltyInput['type']>(currentPenalty.type);
  const [percent, setPercent] = useState(
    currentPenalty.type === 'percent' ? String(currentPenalty.percent) : '10',
  );
  const [reply, setReply] = useState('');

  const scoreNumber = Number(score);
  const scoreValid =
    score.trim() !== '' &&
    Number.isFinite(scoreNumber) &&
    scoreNumber >= 0 &&
    scoreNumber <= points;
  const percentNumber = Number(percent);
  const penalty: PenaltyInput | null =
    penaltyType === 'percent'
      ? Number.isFinite(percentNumber) && percentNumber >= 1 && percentNumber <= 100
        ? { type: 'percent', percent: percentNumber }
        : null
      : { type: penaltyType };
  const valid = reply.trim().length > 0 && (isResponse ? scoreValid : penalty !== null);
  const keeps = isResponse
    ? scoreValid && round2(scoreNumber) === round2(currentScore)
    : penalty !== null &&
      penalty.type === currentPenalty.type &&
      (penalty.type !== 'percent' ||
        (currentPenalty.type === 'percent' && penalty.percent === currentPenalty.percent));

  const resolve = useMutation({
    mutationFn: () =>
      resolveAppeal(
        sessionId,
        data.id,
        isResponse
          ? { response: reply.trim(), score: round2(scoreNumber) }
          : { response: reply.trim(), penalty: penalty as PenaltyInput },
      ),
    onSuccess: (done) => {
      // Cập nhật ngay bằng phản hồi của server (không chờ tải lại) rồi làm tươi các danh sách ở nền.
      queryClient.setQueryData(appealDetailQuery(sessionId, data.id).queryKey, (old) =>
        old
          ? {
              ...old,
              status: done.status,
              response: done.response,
              previousValue: done.previousValue,
              newValue: done.newValue,
              resolvedAt: done.resolvedAt,
            }
          : old,
      );
      toast(t('appeal.screen.done'));
      void queryClient.invalidateQueries({ queryKey: ['grading', sessionId] });
      onResolved();
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['grading', sessionId] }),
  });

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="appeal-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) resolve.mutate();
      }}
    >
      {isResponse ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="appeal-score">
            {t('appeal.screen.newScore', { points: fmt(points) })}
            <input
              id="appeal-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={points}
              step="0.01"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              aria-invalid={!scoreValid || undefined}
              className="h-12 w-32 rounded-lg border border-border-strong bg-surface px-3 text-lg font-semibold tabular-nums outline-none focus:border-primary aria-invalid:border-danger"
            />
          </label>
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="sr-only">{t('appeal.screen.quick')}</legend>
            {QUICK.map((label, i) => {
              const value = round2((points * i) / (QUICK.length - 1));
              return (
                <button
                  key={label}
                  type="button"
                  data-testid={`appeal-quick-${i}`}
                  onClick={() => setScore(String(value))}
                  className="inline-flex min-h-12 min-w-14 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface px-3 font-semibold hover:bg-primary-soft pointer-fine:min-h-9"
                >
                  {label === 'max' ? t('grading.max') : label}
                </button>
              );
            })}
          </fieldset>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{t('appeal.screen.newPenalty')}</legend>
          {(['none', 'percent', 'void'] as const).map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="penalty"
                className="size-5"
                checked={penaltyType === type}
                onChange={() => setPenaltyType(type)}
              />
              {type === 'percent' ? (
                <span className="flex items-center gap-2">
                  {t('appeal.screen.penaltyPercent')}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step="0.01"
                    aria-label={t('grading.penalty.percentLabel')}
                    value={percent}
                    disabled={penaltyType !== 'percent'}
                    onChange={(e) => setPercent(e.target.value)}
                    className="h-11 w-24 rounded-lg border border-border-strong bg-surface px-2 text-center tabular-nums outline-none focus:border-primary disabled:opacity-50"
                  />
                  %
                </span>
              ) : (
                t(`grading.penalty.${type}`)
              )}
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="appeal-reply">
        {t('appeal.screen.replyLabel')}
        <textarea
          id="appeal-reply"
          value={reply}
          maxLength={RESPONSE_MAX}
          rows={4}
          onChange={(e) => setReply(e.target.value)}
          className="min-h-28 w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
        <span className="self-end text-xs font-normal text-fg-muted tabular-nums">
          {reply.trim().length}/{RESPONSE_MAX}
        </span>
      </label>
      {resolve.isError && <ErrorMessage>{errorMessage(t, resolve.error)}</ErrorMessage>}
      <PrimaryButton
        type="submit"
        loading={resolve.isPending}
        disabled={!valid}
        data-testid="appeal-resolve"
        className="self-start"
      >
        {keeps ? t('appeal.screen.keep') : t('appeal.screen.change')}
      </PrimaryButton>
      <p className="text-sm text-fg-muted">
        <Link
          to="/examiner/sessions/$sessionId/results"
          params={{ sessionId }}
          className="underline"
        >
          {t('appeal.screen.backToResults')}
        </Link>
      </p>
    </form>
  );
}
