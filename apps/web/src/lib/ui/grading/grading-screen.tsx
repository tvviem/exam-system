import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Keyboard,
  MessageSquare,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import {
  type EntryData,
  type EssayItem,
  entryQuery,
  essayItemsQuery,
  type QueueData,
  queueQuery,
  saveGrade,
  setBlind,
} from '../../grading';
import { Button, ErrorMessage } from '..';
import { ListSkeleton } from '../admin';
import { RichTextView } from '../rich-text-view';
import { useToast } from '../toast';

// Màn Chấm Câu tự luận (docs/plan/slice-5.md, PR 5b; prototype phương án D, Q290–Q293): chấm theo từng câu trên mọi bài,
// ẩn tên ở server, nút điểm nhanh + ô "Điểm khác", tự sang bài chưa chấm kế tiếp, có Hoàn tác.

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Năm nút điểm nhanh theo điểm tối đa của câu: 0, ¼, ½, ¾, tối đa (làm tròn 0,01). */
export const quickScores = (points: number) =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(points * ratio * 100) / 100);

const QUICK_LABELS = ['0', '¼', '½', '¾', 'max'] as const;

/** Chữ → điểm: nhận dấu phẩy thập phân; ngoài [0, tối đa] hoặc quá 2 chữ số là lỗi. */
export function parseScore(
  text: string,
  points: number,
): { value: number | null; error?: 'range' | 'decimals' } {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return { value: null };
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0 || value > points)
    return { value: null, error: 'range' };
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9)
    return { value: null, error: 'decimals' };
  return { value };
}

export function GradingScreen({
  sessionId,
  itemId,
  onItem,
  backTo,
}: {
  sessionId: string;
  itemId?: string;
  onItem: (itemId: string) => void;
  backTo: React.ReactNode;
}) {
  const { t } = useTranslation();
  const items = useQuery(essayItemsQuery(sessionId));
  if (items.isPending) return <ListSkeleton rows={4} />;
  if (items.isError) return <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>;
  const list = items.data.items;
  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl border border-border bg-surface p-6 text-center">
          {t('grading.noEssay')}
        </p>
        {backTo}
      </div>
    );
  }
  const current =
    list.find((i) => i.itemId === itemId) ??
    list.find((i) => i.pending > 0) ??
    (list[0] as EssayItem);
  return (
    <div className="flex flex-col gap-3">
      {list.length > 1 && <QuestionBar items={list} current={current.itemId} onPick={onItem} />}
      <ItemGrading
        key={current.itemId}
        sessionId={sessionId}
        item={current}
        blind={items.data.blind}
        others={list}
        onItem={onItem}
        backTo={backTo}
      />
    </div>
  );
}

function QuestionBar({
  items,
  current,
  onPick,
}: {
  items: EssayItem[];
  current: string;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const total = items.reduce((sum, i) => sum + i.total, 0);
  const done = items.reduce((sum, i) => sum + i.graded, 0);
  return (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label={t('grading.questions')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {items.map((i) => {
          const selected = i.itemId === current;
          return (
            <button
              key={i.itemId}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onPick(i.itemId)}
              className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap pointer-fine:min-h-9 ${
                selected
                  ? 'border-primary bg-primary-soft text-on-primary-soft'
                  : 'border-border-strong bg-surface'
              }`}
            >
              {t('grading.questionTab', { no: i.no, graded: i.graded, total: i.total })}
              {i.pending === 0 && <Check aria-hidden className="size-4 text-success" />}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-fg-muted">{t('grading.overall', { graded: done, total })}</p>
    </div>
  );
}

interface Undo {
  attemptId: string;
  label: string;
  previous: { score: number | null; feedback: string | null };
}

function ItemGrading({
  sessionId,
  item,
  blind,
  others,
  onItem,
  backTo,
}: {
  sessionId: string;
  item: EssayItem;
  blind: boolean;
  others: EssayItem[];
  onItem: (id: string) => void;
  backTo: React.ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [currentId, setCurrentId] = useState<string | undefined>();
  const [listOpen, setListOpen] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [saving, setSaving] = useState(0);
  const queue = useQuery(queueQuery(sessionId, item.itemId, 'all'));

  const entries = queue.data?.entries ?? [];
  const visible = useMemo(
    () =>
      filter === 'all' ? entries : entries.filter((e) => !e.graded || e.attemptId === currentId),
    [entries, filter, currentId],
  );
  // Bài đầu tiên cần chấm khi mở câu; giữ nguyên bài đang xem khi dữ liệu làm mới.
  useEffect(() => {
    if (currentId && entries.some((e) => e.attemptId === currentId)) return;
    const first = entries.find((e) => !e.graded) ?? entries[0];
    setCurrentId(first?.attemptId);
  }, [entries, currentId]);

  const index = Math.max(
    0,
    visible.findIndex((e) => e.attemptId === currentId),
  );
  const entry = useQuery({
    ...entryQuery(sessionId, item.itemId, currentId ?? ''),
    enabled: Boolean(currentId),
  });
  // Nạp trước bài kế để chuyển bài gần như tức thì.
  const nextId = visible[index + 1]?.attemptId;
  useEffect(() => {
    if (nextId) void queryClient.prefetchQuery(entryQuery(sessionId, item.itemId, nextId));
  }, [nextId, queryClient, sessionId, item.itemId]);

  const patchQueue = useCallback(
    (attemptId: string, score: number | null) =>
      queryClient.setQueryData<QueueData>(
        queueQuery(sessionId, item.itemId, 'all').queryKey,
        (data) => {
          if (!data) return data;
          const entries = data.entries.map((e) =>
            e.attemptId === attemptId ? { ...e, graded: score !== null, score } : e,
          );
          const graded = entries.filter((e) => e.graded).length;
          return { ...data, entries, graded, pending: entries.length - graded };
        },
      ),
    [queryClient, sessionId, item.itemId],
  );

  const save = useMutation({
    mutationFn: (vars: { attemptId: string; score: number | null; feedback?: string | null }) =>
      saveGrade(sessionId, vars.attemptId, item.itemId, {
        score: vars.score,
        feedback: vars.feedback,
      }),
    onMutate: () => setSaving((n) => n + 1),
    onSettled: () => {
      setSaving((n) => n - 1);
      void queryClient.invalidateQueries({ queryKey: ['grading', sessionId, 'items'] });
      void queryClient.invalidateQueries({ queryKey: ['grading', sessionId, 'results'] });
    },
    onError: (error, vars) => {
      toast(errorMessage(t, error), 'error');
      // Lưu lỗi: trả bài về trạng thái cũ và quay lại bài đó.
      void queryClient.invalidateQueries({
        queryKey: queueQuery(sessionId, item.itemId, 'all').queryKey,
      });
      setCurrentId(vars.attemptId);
    },
  });

  const nextPendingAfter = (attemptId: string) => {
    const all =
      queryClient.getQueryData<QueueData>(queueQuery(sessionId, item.itemId, 'all').queryKey)
        ?.entries ?? [];
    const from = all.findIndex((e) => e.attemptId === attemptId);
    for (let step = 1; step < all.length; step++) {
      const e = all[(from + step) % all.length];
      if (e && !e.graded) return e.attemptId;
    }
    return undefined;
  };

  /** Lưu điểm của bài đang xem rồi sang bài chưa chấm kế tiếp (lạc quan: không chờ server). */
  const grade = (score: number, feedback: string | null | undefined, advance: boolean) => {
    const target = entry.data;
    if (!target) return;
    const label = entries.find((e) => e.attemptId === target.attemptId)?.label ?? target.label;
    setUndo({
      attemptId: target.attemptId,
      label,
      previous: { score: target.score, feedback: target.feedback },
    });
    patchQueue(target.attemptId, score);
    queryClient.setQueryData<EntryData>(
      entryQuery(sessionId, item.itemId, target.attemptId).queryKey,
      { ...target, score, graded: true, feedback: feedback ?? target.feedback },
    );
    save.mutate({ attemptId: target.attemptId, score, feedback });
    if (advance) setCurrentId(nextPendingAfter(target.attemptId) ?? target.attemptId);
  };

  const doUndo = () => {
    if (!undo) return;
    patchQueue(undo.attemptId, undo.previous.score);
    queryClient.removeQueries({
      queryKey: entryQuery(sessionId, item.itemId, undo.attemptId).queryKey,
    });
    save.mutate({
      attemptId: undo.attemptId,
      score: undo.previous.score,
      feedback: undo.previous.feedback,
    });
    setCurrentId(undo.attemptId);
    setUndo(null);
  };

  const go = (delta: number) => {
    const target = visible[index + delta];
    if (target) setCurrentId(target.attemptId);
  };

  const blindMutation = useMutation({
    mutationFn: (next: boolean) => setBlind(sessionId, next),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['grading', sessionId] }),
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });

  // Phím tắt (Q293): J/K chuyển bài, 1–5 chấm nhanh; bỏ qua khi đang gõ.
  const quick = quickScores(item.points);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e) => {
    if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'j' || e.key === 'J') go(1);
    else if (e.key === 'k' || e.key === 'K') go(-1);
    else if (/^[1-5]$/.test(e.key)) grade(quick[Number(e.key) - 1] as number, undefined, true);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (queue.isPending) return <ListSkeleton rows={4} />;
  if (queue.isError) return <ErrorMessage>{errorMessage(t, queue.error)}</ErrorMessage>;

  const done = queue.data.pending === 0;
  const nextItem = others.find((o) => o.itemId !== item.itemId && o.pending > 0);
  const pct =
    queue.data.total === 0 ? 100 : Math.round((queue.data.graded / queue.data.total) * 100);

  return (
    <div className="grid gap-4 pb-44 lg:grid-cols-[17rem_1fr] lg:pb-0">
      <aside className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {t('grading.progress', { graded: queue.data.graded, total: queue.data.total })}
            </span>
            <span className="tabular-nums text-fg-muted">{pct}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <fieldset className="flex gap-1 border-0 p-0">
          <legend className="sr-only">{t('grading.filter')}</legend>
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-11 cursor-pointer rounded-lg border px-3 text-sm font-medium pointer-fine:min-h-9 ${
                filter === f
                  ? 'border-primary bg-primary-soft text-on-primary-soft'
                  : 'border-border-strong bg-surface'
              }`}
            >
              {t(f === 'pending' ? 'grading.filterPending' : 'grading.filterAll', {
                count: f === 'pending' ? queue.data.pending : queue.data.total,
              })}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          aria-expanded={listOpen}
          onClick={() => setListOpen((o) => !o)}
          className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium lg:hidden"
        >
          {t('grading.list', { count: visible.length })}
          {listOpen ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
        </button>
        <div className={`${listOpen ? 'block' : 'hidden'} lg:block`}>
          <ul
            className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-20rem)]"
            aria-label={t('grading.list', { count: visible.length })}
          >
            {visible.map((e) => (
              <li key={e.attemptId}>
                <button
                  type="button"
                  aria-current={e.attemptId === currentId}
                  onClick={() => {
                    setCurrentId(e.attemptId);
                    setListOpen(false);
                  }}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${
                    e.attemptId === currentId
                      ? 'bg-primary-soft font-semibold text-on-primary-soft'
                      : 'hover:bg-border/50'
                  }`}
                >
                  <span className="truncate">{e.label}</span>
                  <span className="tabular-nums text-fg-muted">
                    {e.graded ? fmt(e.score) : '○'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="flex min-w-0 flex-col gap-3">
        <details className="rounded-lg border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {t('grading.questionPanel', { no: item.no, points: fmt(item.points) })}
          </summary>
          <div className="mt-2 text-sm">
            <RichTextView doc={item.stem} />
          </div>
          {entry.data?.item.rubric && (
            <div className="mt-2 border-t border-border pt-2 text-sm text-fg-muted">
              <p className="font-medium text-fg">{t('grading.rubric')}</p>
              <RichTextView doc={entry.data.item.rubric} />
            </div>
          )}
        </details>

        {entry.isError && <ErrorMessage>{errorMessage(t, entry.error)}</ErrorMessage>}
        {currentId && entry.data ? (
          <EntryPane
            key={entry.data.attemptId}
            entry={entry.data}
            blind={blind}
            points={item.points}
            quick={quick}
            index={index}
            count={visible.length}
            saving={saving > 0}
            onGrade={grade}
            onPrev={() => go(-1)}
            onNext={() => go(1)}
            onBlind={() => blindMutation.mutate(!blind)}
            undo={undo}
            onUndo={doUndo}
          />
        ) : currentId ? (
          <ListSkeleton rows={3} />
        ) : null}

        {done && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm"
          >
            <span className="font-medium">{t('grading.itemDone', { no: item.no })}</span>
            {nextItem ? (
              <Button variant="primary" onClick={() => onItem(nextItem.itemId)}>
                {t('grading.nextItem', { no: nextItem.no, count: nextItem.pending })}
              </Button>
            ) : (
              backTo
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function EntryPane({
  entry,
  blind,
  points,
  quick,
  index,
  count,
  saving,
  onGrade,
  onPrev,
  onNext,
  onBlind,
  undo,
  onUndo,
}: {
  entry: EntryData;
  blind: boolean;
  points: number;
  quick: number[];
  index: number;
  count: number;
  saving: boolean;
  onGrade: (score: number, feedback: string | null | undefined, advance: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  onBlind: () => void;
  undo: Undo | null;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(Boolean(entry.feedback));
  const [feedback, setFeedback] = useState(entry.feedback ?? '');
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<'range' | 'decimals' | null>(null);
  const feedbackValue = feedback.trim() === '' ? null : feedback.trim();

  const commitCustom = () => {
    const parsed = parseScore(text, points);
    if (parsed.error) return setError(parsed.error);
    if (parsed.value === null) return;
    setError(null);
    setCustom(false);
    setText('');
    onGrade(parsed.value, feedbackValue, true);
  };
  const saveFeedbackOnly = () => {
    if (entry.graded && entry.score !== null && feedbackValue !== (entry.feedback ?? null)) {
      onGrade(entry.score, feedbackValue, false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {entry.person
            ? `${entry.label} · ${entry.person.fullName} (${entry.person.code ?? '—'})`
            : entry.label}
        </h2>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 text-sm ${saving ? 'text-fg-muted' : 'text-success'}`}
            aria-live="polite"
          >
            <Check aria-hidden className="size-4" />
            {saving ? t('grading.saving') : t('grading.saved')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('grading.prev')}
              onClick={onPrev}
              disabled={index === 0}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40 pointer-fine:size-9"
            >
              <ArrowLeft aria-hidden className="size-4" />
            </button>
            <span className="text-sm tabular-nums text-fg-muted">
              {count === 0 ? '0/0' : `${index + 1}/${count}`}
            </span>
            <button
              type="button"
              aria-label={t('grading.next')}
              onClick={onNext}
              disabled={index >= count - 1}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40 pointer-fine:size-9"
            >
              <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <article
        data-testid="answer"
        className="rounded-xl border border-border bg-surface p-4 text-lg leading-relaxed whitespace-pre-wrap break-words"
      >
        {entry.answer || t('grading.emptyAnswer')}
      </article>
      {note && (
        <textarea
          aria-label={t('grading.feedback')}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onBlur={saveFeedbackOnly}
          placeholder={t('grading.feedbackHint')}
          rows={2}
          maxLength={1000}
          className="rounded-lg border border-border-strong bg-surface p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      )}
      {undo && (
        <p
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
        >
          {t('grading.undoNote', { label: undo.label })}
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 font-semibold underline"
          >
            <Undo2 aria-hidden className="size-4" />
            {t('grading.undo')}
          </button>
        </p>
      )}
      <div className="fixed inset-x-0 bottom-[var(--app-tabbar-h,0px)] z-40 border-t border-border bg-surface/95 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur lg:static lg:rounded-xl lg:border lg:shadow-none">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-5 gap-2">
            {quick.map((value, i) => (
              <button
                key={QUICK_LABELS[i]}
                type="button"
                data-testid={`quick-${i + 1}`}
                aria-pressed={entry.graded && entry.score === value}
                onClick={() => onGrade(value, feedbackValue, true)}
                className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border text-base font-bold hover:bg-primary-soft lg:min-h-14 ${
                  entry.graded && entry.score === value
                    ? 'border-primary bg-primary-soft'
                    : 'border-border-strong bg-surface'
                }`}
              >
                {QUICK_LABELS[i] === 'max' ? t('grading.max') : QUICK_LABELS[i]}
                <span className="text-[11px] font-normal text-fg-muted">
                  {t('grading.pointsShort', { value: fmt(value) })}
                </span>
                <span className="sr-only">{t('grading.key', { n: i + 1 })}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={custom}
              onClick={() => setCustom((c) => !c)}
              className="min-h-11 cursor-pointer rounded-lg border border-border-strong px-3 text-sm pointer-fine:min-h-9"
            >
              {t('grading.custom')}
            </button>
            <button
              type="button"
              aria-pressed={note}
              aria-label={t('grading.feedback')}
              onClick={() => setNote((n) => !n)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong px-3 text-sm pointer-fine:min-h-9"
            >
              <MessageSquare aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t('grading.feedbackShort')}</span>
            </button>
            <button
              type="button"
              aria-pressed={blind}
              onClick={onBlind}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium pointer-fine:min-h-9"
            >
              {blind ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
              {t(blind ? 'grading.blindOn' : 'grading.blindOff')}
            </button>
            {custom && (
              <div className="flex flex-col gap-1">
                <input
                  // biome-ignore lint/a11y/noAutofocus: người chấm vừa bấm "Điểm khác" để gõ ngay
                  autoFocus
                  inputMode="decimal"
                  aria-label={t('grading.score')}
                  aria-invalid={error !== null}
                  placeholder={`0 – ${fmt(points)}`}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && commitCustom()}
                  className="h-11 w-28 rounded-lg border border-border-strong bg-surface px-3 text-center text-lg font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-9"
                />
                {error && (
                  <p className="text-sm text-danger">
                    {t(error === 'range' ? 'grading.errorRange' : 'grading.errorDecimals', {
                      max: fmt(points),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
          <p className="hidden items-center gap-1 text-sm text-fg-muted pointer-fine:inline-flex">
            <Keyboard aria-hidden className="size-4" />
            {t('grading.keyHint')}
          </p>
        </div>
      </div>
    </>
  );
}

export function BackToResults({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/examiner/sessions/$sessionId/results"
      params={{ sessionId }}
      className="inline-flex min-h-11 items-center rounded-lg border border-border-strong px-3 text-sm font-medium"
    >
      {t('grading.backToResults')}
    </Link>
  );
}
