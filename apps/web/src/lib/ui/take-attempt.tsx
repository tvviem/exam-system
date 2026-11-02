import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  LayoutGrid,
  Loader2,
  Timer,
  TriangleAlert,
  Type,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api';
import { errorMessage } from '../errors';
import { formatDateTime } from '../format';
import {
  type AttemptView,
  attemptQuery,
  attemptQueryKey,
  submitAttempt,
  type TakeItem,
} from '../take';
import { type AnswerState, answerStateOf, progressOf } from '../take/answers';
import { formatClock } from '../take/clock';
import type { SaveStatus } from '../take/save-queue';
import { useCountdown } from '../take/use-countdown';
import { usePrefs } from '../take/use-prefs';
import { type StopReason, useSaver } from '../take/use-saver';
import { BusyNotice, Button, buttonClass, Dialog, ErrorMessage, PrimaryButton } from '.';
import { MediaSourceContext } from './illustration-image';
import { RichTextView } from './rich-text-view';
import { TakePrefsDialog } from './take-prefs';
import { TakeQuestion } from './take-question';
import { ThemeSwitcher } from './theme-switcher';

// Màn làm bài (Q240–Q244). Câu trả lời nằm ở trạng thái cục bộ, được lưu lên server qua hàng đợi (use-saver);
// đồng hồ chỉ hiển thị giờ server tính (use-countdown).

type Answers = Record<string, { value: unknown; flagged: boolean }>;

const STATE_KEY = {
  done: 'take.state.done',
  partial: 'take.state.partial',
  blank: 'take.state.blank',
} as const;

function SaveBadge({ status, unsaved }: { status: SaveStatus; unsaved: number }) {
  const { t } = useTranslation();
  const text =
    status === 'saved'
      ? t('take.save.saved')
      : status === 'saving'
        ? t('take.save.saving')
        : status === 'offline'
          ? t('take.save.offline', { count: unsaved })
          : t('take.save.unsaved', { count: unsaved });
  const Icon =
    status === 'saved'
      ? CheckCheck
      : status === 'saving'
        ? Loader2
        : status === 'offline'
          ? CloudOff
          : TriangleAlert;
  const tone =
    status === 'saved' ? 'text-success' : status === 'saving' ? 'text-fg-muted' : 'text-warning';
  return (
    <div
      role="status"
      aria-label={t('take.save.label')}
      className={`inline-flex min-h-12 items-center gap-1.5 px-1 font-sans text-sm font-medium ${tone}`}
    >
      <Icon
        aria-hidden
        className={`size-5 shrink-0 ${status === 'saving' ? 'motion-safe:animate-spin' : ''}`}
      />
      <span className="max-sm:sr-only">{text}</span>
    </div>
  );
}

export function AttemptRunner({ view }: { view: AttemptView }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const attemptId = view.attempt.id;
  const items = useMemo(() => view.sections.flatMap((section) => section.items), [view]);
  const { prefs, update: updatePrefs, mode } = usePrefs();

  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(
      items.flatMap((item) =>
        item.response
          ? [[item.itemId, { value: item.response.value, flagged: item.response.flagged }]]
          : [],
      ),
    ),
  );
  const [current, setCurrent] = useState(0);
  const [gridOpen, setGridOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [stop, setStop] = useState<StopReason | null>(null);

  const countdown = useCountdown(view.attempt);
  const saver = useSaver({
    attemptId,
    seqs: Object.fromEntries(
      items.flatMap((item) => (item.response ? [[item.itemId, item.response.clientSeq]] : [])),
    ),
    onServerTime: countdown.resync,
    onStop: setStop,
  });

  const closeNow = useCallback(async () => {
    // Lượt đã đóng ở server (hết giờ, bị Hủy): lấy trạng thái "đã nộp" thật.
    await queryClient.refetchQueries(attemptQuery(attemptId));
  }, [attemptId, queryClient]);

  useEffect(() => {
    if (stop === 'ATTEMPT_CLOSED') void closeNow();
  }, [stop, closeNow]);

  const submit = useMutation({
    mutationFn: async () => {
      const drained = await saver.drain();
      if (!drained) throw new ApiError(0, 'UNSAVED');
      return submitAttempt(attemptId);
    },
    onSuccess: (state) => {
      queryClient.setQueryData(attemptQueryKey(attemptId), state);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.details.reason === 'ATTEMPT_CLOSED') void closeNow();
    },
  });

  // Hết giờ: nộp ngay (cố lưu nốt trước), mất mạng thì thử lại cho đến khi được; server vẫn tự đóng Lượt sau ân hạn.
  const [timedOut, setTimedOut] = useState(false);
  const expire = useCallback(() => {
    setTimedOut(true);
    void (async () => {
      await saver.drain().catch(() => false);
      for (;;) {
        try {
          queryClient.setQueryData(attemptQueryKey(attemptId), await submitAttempt(attemptId));
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            await closeNow();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    })();
  }, [saver, queryClient, attemptId, closeNow]);
  const expireRef = useRef(expire);
  expireRef.current = expire;
  useEffect(() => {
    if (countdown.warning === 'over') expireRef.current();
  }, [countdown.warning]);

  const setValue = (itemId: string, value: unknown, kind: 'choice' | 'text' = 'choice') => {
    setAnswers((previous) => ({
      ...previous,
      [itemId]: { value, flagged: previous[itemId]?.flagged ?? false },
    }));
    saver.change({ itemId, value }, kind);
  };
  const setFlag = (itemId: string, flagged: boolean) => {
    setAnswers((previous) => ({
      ...previous,
      [itemId]: { value: previous[itemId]?.value, flagged },
    }));
    saver.change({ itemId, flagged });
  };

  const progress = progressOf(
    items.map((item) => ({
      item,
      response: answers[item.itemId]
        ? { value: answers[item.itemId]?.value, flagged: answers[item.itemId]?.flagged ?? false }
        : null,
    })),
  );
  const stateOf = (item: TakeItem): AnswerState => answerStateOf(item, answers[item.itemId]?.value);

  const goTo = (index: number) => {
    setCurrent(index);
    setGridOpen(false);
    setSubmitOpen(false);
    if (mode === 'all') {
      const target = items[index];
      requestAnimationFrame(() =>
        document.getElementById(`item-${target?.itemId}`)?.scrollIntoView({ block: 'start' }),
      );
    } else {
      window.scrollTo({ top: 0 });
    }
  };

  if (stop === 'DEVICE_REVOKED' || stop === 'NOT_FOUND') {
    return <StopScreen reason={stop} />;
  }

  const handlers = {
    onValue: setValue,
    onFlag: setFlag,
    onBlurText: () => void saver.drain(),
  };
  const visible =
    mode === 'one' ? [items[current]].filter((item): item is TakeItem => !!item) : items;
  const sectionOf = (item: TakeItem) => view.sections.find((s) => s.items.includes(item));
  const warning = countdown.warning;
  const clockTone =
    warning === 'one' || warning === 'over'
      ? 'bg-danger-soft text-danger'
      : warning === 'five'
        ? 'bg-warning-soft text-warning'
        : 'text-fg';
  const hasInstructions = (view.exam.instructions?.content ?? []).some(
    (block) => block.type !== 'paragraph' || (block.content ?? []).length > 0,
  );

  return (
    <MediaSourceContext.Provider value={(id, side) => `${view.mediaBase}/${id}/${side}`}>
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-1 px-3">
          <div
            role="timer"
            aria-label={t('take.timeLeft')}
            className={`inline-flex min-h-12 items-center rounded-lg px-3 font-mono text-lg font-semibold tabular-nums ${clockTone}`}
          >
            {formatClock(countdown.remaining)}
          </div>
          <SaveBadge status={saver.status} unsaved={saver.unsaved} />
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={t('take.prefs.open')}
              onClick={() => setPrefsOpen(true)}
              className="inline-flex size-12 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft hover:text-fg"
            >
              <Type aria-hidden className="size-5" />
            </button>
            <Button variant="primary" onClick={() => setSubmitOpen(true)}>
              {t('take.submit')}
            </Button>
          </div>
        </div>
        {(warning === 'five' || warning === 'one') && (
          <p
            role="alert"
            className={`px-4 py-2 text-center font-sans text-sm font-medium ${
              warning === 'one' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
            }`}
          >
            <Timer aria-hidden className="mr-1 inline size-4 align-text-bottom" />
            {t(warning === 'one' ? 'take.warn.one' : 'take.warn.five')}
          </p>
        )}
      </header>

      <div
        className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 pb-32"
        style={{ fontSize: `${prefs.fontScale / 100}rem` }}
      >
        {timedOut && <BusyNotice title={t('take.timedOut')} hint={t('take.timedOutHint')} />}
        <div className="flex items-center justify-between gap-3 font-sans">
          <fieldset className="inline-flex rounded-lg border border-border p-0.5">
            <legend className="sr-only">{t('take.mode.label')}</legend>
            {(['one', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => updatePrefs({ viewMode: value })}
                className={`min-h-12 cursor-pointer rounded-md px-3 text-sm font-medium ${
                  mode === value
                    ? 'bg-primary-soft text-on-primary-soft'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {t(`take.mode.${value}`)}
              </button>
            ))}
          </fieldset>
          {mode === 'one' && (
            <p className="text-sm text-fg-muted">
              {t('take.position', { current: current + 1, total: items.length })}
            </p>
          )}
        </div>

        {hasInstructions && (
          <details className="rounded-lg border border-border bg-surface p-3">
            <summary className="min-h-12 cursor-pointer py-3 font-sans font-medium">
              {t('take.instructions')}
            </summary>
            {view.exam.instructions && <RichTextView doc={view.exam.instructions} />}
          </details>
        )}

        <div className={`flex flex-col gap-4 ${prefs.serif ? 'font-serif' : 'font-sans'}`}>
          {visible.map((item, index) => {
            const section = sectionOf(item);
            const first = section?.items[0] === item || mode === 'one';
            return (
              <div key={item.itemId} className="flex flex-col gap-3">
                {first && section?.title && (
                  <h2 className="font-sans text-lg font-semibold">{section.title}</h2>
                )}
                {first && section?.instructions && mode === 'one' && index === 0 && (
                  <RichTextView doc={section.instructions} className="text-fg-muted" />
                )}
                <TakeQuestion
                  item={item}
                  value={answers[item.itemId]?.value}
                  flagged={answers[item.itemId]?.flagged ?? false}
                  handlers={handlers}
                />
              </div>
            );
          })}
        </div>
      </div>

      <nav
        aria-label={t('take.navLabel')}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setGridOpen(true)}
            className={buttonClass('secondary', 'flex-1 justify-start')}
          >
            <LayoutGrid aria-hidden className="size-5" />
            {t('take.grid.open', { done: progress.done, total: progress.total })}
          </button>
          {mode === 'one' && (
            <>
              <button
                type="button"
                aria-label={t('take.prev')}
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
                className={buttonClass('secondary', 'size-12 shrink-0 px-0')}
              >
                <ChevronLeft aria-hidden className="size-6" />
              </button>
              <button
                type="button"
                aria-label={t('take.next')}
                disabled={current >= items.length - 1}
                onClick={() => goTo(current + 1)}
                className={buttonClass('primary', 'size-12 shrink-0 px-0')}
              >
                <ChevronRight aria-hidden className="size-6" />
              </button>
            </>
          )}
        </div>
      </nav>

      <Dialog open={gridOpen} onClose={() => setGridOpen(false)} title={t('take.grid.title')}>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-sans text-sm text-fg-muted">
          {(['done', 'partial', 'blank'] as const).map((state) => (
            <li key={state} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`size-3 rounded-sm border ${CELL_TONE[state]}`} />
              {t(STATE_KEY[state])}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border-2 border-warning" />
            {t('take.state.flagged')}
          </li>
        </ul>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
          {items.map((item, index) => {
            const state = stateOf(item);
            const flagged = answers[item.itemId]?.flagged ?? false;
            return (
              <button
                key={item.itemId}
                type="button"
                aria-label={`${t('take.question', { no: item.no })}, ${t(STATE_KEY[state])}${flagged ? `, ${t('take.state.flaggedShort')}` : ''}`}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => goTo(index)}
                className={`inline-flex size-12 cursor-pointer items-center justify-center rounded-lg border-2 font-sans text-sm font-semibold ${CELL_TONE[state]} ${
                  flagged ? 'border-warning' : ''
                } ${index === current ? 'ring-2 ring-ring' : ''}`}
              >
                {item.no}
              </button>
            );
          })}
        </div>
      </Dialog>

      <Dialog
        open={submitOpen}
        onClose={() => !submit.isPending && setSubmitOpen(false)}
        title={t('take.confirm.title')}
        dismissible={!submit.isPending}
      >
        <div className="flex flex-col gap-3">
          {progress.blank === 0 && progress.partial === 0 ? (
            <p>{t('take.confirm.allDone', { count: progress.total })}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {progress.blank > 0 && (
                <li className="flex items-start gap-2 text-danger">
                  <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                  <span>{t('take.confirm.blank', { count: progress.blank })}</span>
                </li>
              )}
              {progress.partial > 0 && (
                <li className="flex items-start gap-2 text-warning">
                  <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                  <span>{t('take.confirm.partial', { count: progress.partial })}</span>
                </li>
              )}
            </ul>
          )}
          {progress.flagged > 0 && <p>{t('take.confirm.flagged', { count: progress.flagged })}</p>}
          <JumpList
            items={items.flatMap((item, index) =>
              stateOf(item) !== 'done' || answers[item.itemId]?.flagged ? [{ item, index }] : [],
            )}
            onJump={goTo}
          />
          <p className="text-sm text-fg-muted">{t('take.confirm.final')}</p>
          {submit.isError && (
            <ErrorMessage>
              {submit.error instanceof ApiError && submit.error.code === 'UNSAVED'
                ? t('take.confirm.unsaved')
                : errorMessage(t, submit.error)}
            </ErrorMessage>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setSubmitOpen(false)} disabled={submit.isPending}>
              {t('take.confirm.continue')}
            </Button>
            <PrimaryButton loading={submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? t('take.confirm.submitting') : t('take.submit')}
            </PrimaryButton>
          </div>
        </div>
      </Dialog>

      <TakePrefsDialog
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        prefs={prefs}
        onChange={updatePrefs}
      >
        <ThemeSwitcher />
      </TakePrefsDialog>
    </MediaSourceContext.Provider>
  );
}

const CELL_TONE: Record<AnswerState, string> = {
  done: 'border-primary bg-primary-soft text-on-primary-soft',
  partial: 'border-warning bg-warning-soft text-warning',
  blank: 'border-border-strong bg-surface text-fg',
};

/** Các câu cần xem lại (chưa làm, làm dở, đánh dấu): chạm để nhảy tới. */
function JumpList({
  items,
  onJump,
}: {
  items: { item: TakeItem; index: number }[];
  onJump: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <ul aria-label={t('take.confirm.review')} className="flex flex-wrap gap-2">
      {items.map(({ item, index }) => (
        <li key={item.itemId}>
          <button
            type="button"
            onClick={() => onJump(index)}
            className="inline-flex size-12 cursor-pointer items-center justify-center rounded-lg border border-border-strong font-sans text-sm font-semibold hover:bg-primary-soft"
            aria-label={t('take.confirm.jump', { no: item.no })}
          >
            {item.no}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Server báo thiết bị bị thu hồi hoặc Lượt không còn: dừng hẳn, không cho làm tiếp (Q244). */
export function StopScreen({ reason }: { reason: 'DEVICE_REVOKED' | 'NOT_FOUND' }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">{t(`take.stop.${reason}.title`)}</h1>
      <p>{t(`take.stop.${reason}.body`)}</p>
      <Link to="/take" className={buttonClass('primary')}>
        {t('take.backToList')}
      </Link>
    </main>
  );
}

/** Lượt đã nộp: chỉ còn giờ nộp, không có nội dung đề và không có điểm (Q206). */
export function SubmittedScreen({ submittedAt }: { submittedAt: string | null }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <CheckCheck aria-hidden className="size-12 text-success" />
      <h1 className="text-2xl font-semibold">{t('take.submitted.title')}</h1>
      {submittedAt && <p>{t('take.submitted.body', { time: formatDateTime(submittedAt) })}</p>}
      <p className="text-fg-muted">{t('take.submitted.note')}</p>
      <Link to="/take" className={buttonClass('primary')}>
        {t('take.backToList')}
      </Link>
    </main>
  );
}
