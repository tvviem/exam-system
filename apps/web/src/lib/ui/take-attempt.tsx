import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  LayoutGrid,
  type LucideIcon,
  Timer,
  TriangleAlert,
  Type,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  type AttemptView,
  attemptQueryKey,
  fetchAttemptOnline,
  submitAttempt,
  type TakeItem,
  UnsavedError,
} from '../take';
import { type AnswerState, answerStateOf, progressOf } from '../take/answers';
import { formatClock } from '../take/clock';
import { forgetAttemptLocally } from '../take/local-data';
import type { SaveStatus } from '../take/save-queue';
import { useCountdown } from '../take/use-countdown';
import { usePrefs } from '../take/use-prefs';
import { type StopReason, stopReasonOf, useSaver } from '../take/use-saver';
import { warmMedia } from '../take/warm-media';
import { BusyNotice, Button, buttonClass, Dialog, ErrorMessage, PrimaryButton, Spinner } from '.';
import { MediaSourceContext } from './illustration-image';
import { preloadKatex } from './math-view';
import { RichTextView } from './rich-text-view';
import { TakePrefsDialog } from './take-prefs';
import { TakeQuestion } from './take-question';
import { StopScreen } from './take-screens';
import { ThemeSwitcher } from './theme-switcher';

// Màn làm bài (Q240–Q244). Câu trả lời nằm ở trạng thái cục bộ, được lưu lên server qua hàng đợi (use-saver);
// đồng hồ chỉ hiển thị giờ server tính (use-countdown).

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Answers = Record<string, { value: unknown; flagged: boolean }>;

const STATE_KEY = {
  done: 'take.state.done',
  partial: 'take.state.partial',
  blank: 'take.state.blank',
} as const;

const SAVE_VIEW: Record<SaveStatus, { key: string; Icon: LucideIcon | null; tone: string }> = {
  saved: { key: 'take.save.saved', Icon: CheckCheck, tone: 'text-success' },
  saving: { key: 'take.save.saving', Icon: null, tone: 'text-fg-muted' },
  offline: { key: 'take.save.offline', Icon: CloudOff, tone: 'text-warning' },
  unsaved: { key: 'take.save.unsaved', Icon: TriangleAlert, tone: 'text-warning' },
};

function SaveBadge({ status, unsaved }: { status: SaveStatus; unsaved: number }) {
  const { t } = useTranslation();
  const { key, Icon, tone } = SAVE_VIEW[status];
  return (
    <div
      role="status"
      aria-label={t('take.save.label')}
      className={`inline-flex min-h-12 items-center gap-1.5 px-1 font-sans text-sm font-medium ${tone}`}
    >
      {Icon ? (
        <Icon aria-hidden className="size-5 shrink-0" />
      ) : (
        <Spinner className="size-5 shrink-0" />
      )}
      <span className="max-sm:sr-only">{t(key, { count: unsaved })}</span>
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
  // Mở từ bản sao trên máy (mất mạng lúc tải lại) cho tới khi server nhận được một lần lưu.
  const [connected, setConnected] = useState(!view.offline);

  const countdown = useCountdown(view.attempt);
  const saver = useSaver({
    attemptId,
    known: items.flatMap((item) =>
      item.response
        ? [
            {
              itemId: item.itemId,
              clientSeq: item.response.clientSeq,
              value: item.response.value,
              flagged: item.response.flagged,
            },
          ]
        : [],
    ),
    unsent: view.unsent,
    onServerTime: (time) => {
      setConnected(true);
      countdown.resync(time);
    },
    onStop: setStop,
  });

  // Còn mạng thì tải trước ảnh và KaTeX, để tải lại lúc mất mạng vẫn thấy đủ (Q243).
  useEffect(() => {
    if (!view.offline) warmMedia(view, preloadKatex);
  }, [view]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { drain, change } = saver;
  const unsavedRef = useRef(0);
  unsavedRef.current = saver.unsaved;

  /** Lượt đã đóng ở server (hết giờ, bị Hủy): lấy trạng thái "đã nộp" thật; mất mạng thì thử lại cho đến khi được. */
  const closeNow = useCallback(async () => {
    while (alive.current) {
      try {
        // Hỏi thẳng server: bản sao trên máy không cho biết Lượt đã đóng.
        const state = await fetchAttemptOnline(attemptId);
        // Câu còn chờ gửi khi Lượt đóng sẽ không được nhận: nói rõ, không để mất âm thầm.
        queryClient.setQueryData(
          attemptQueryKey(attemptId),
          state.status === 'submitted' && unsavedRef.current > 0
            ? { ...state, lostAnswers: unsavedRef.current }
            : state,
        );
        return;
      } catch (error) {
        if (stopReasonOf(error) === 'DEVICE_REVOKED') {
          setStop('DEVICE_REVOKED');
          return;
        }
        await sleep(3000);
      }
    }
  }, [attemptId, queryClient]);

  useEffect(() => {
    if (stop === 'ATTEMPT_CLOSED') void closeNow();
  }, [stop, closeNow]);

  // Máy ngủ hoặc tab bị ẩn làm đồng hồ trình duyệt chậm lại: khi hiện lại, hỏi server giờ chính xác (cũng biết nếu Lượt đã đóng).
  const { resync } = countdown;
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const state = await fetchAttemptOnline(attemptId);
        if (state.status === 'submitted')
          queryClient.setQueryData(attemptQueryKey(attemptId), state);
        else resync(state.attempt);
      } catch (error) {
        if (stopReasonOf(error) === 'DEVICE_REVOKED') setStop('DEVICE_REVOKED');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [attemptId, queryClient, resync]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!(await drain())) throw new UnsavedError();
      return submitAttempt(attemptId);
    },
    onSuccess: (state) => {
      void forgetAttemptLocally(attemptId);
      queryClient.setQueryData(attemptQueryKey(attemptId), state);
    },
    onError: (error) => {
      const reason = stopReasonOf(error);
      if (reason === 'ATTEMPT_CLOSED') void closeNow();
      else if (reason) setStop(reason);
    },
  });

  // Hết giờ: nộp ngay, nhưng phải lưu xong các câu còn chờ trước; mất mạng thì thử lại cho đến khi được (server vẫn tự
  // đóng Lượt sau ân hạn, nên Lượt không bao giờ treo).
  const [timedOut, setTimedOut] = useState(false);
  const expiring = useRef(false);
  const expire = useCallback(async () => {
    if (expiring.current) return;
    expiring.current = true;
    setTimedOut(true);
    while (alive.current) {
      if (!(await drain())) {
        await sleep(3000);
        continue;
      }
      try {
        const state = await submitAttempt(attemptId);
        void forgetAttemptLocally(attemptId);
        queryClient.setQueryData(attemptQueryKey(attemptId), state);
        return;
      } catch (error) {
        const reason = stopReasonOf(error);
        if (reason === 'ATTEMPT_CLOSED') return closeNow();
        if (reason) return setStop(reason);
        await sleep(3000);
      }
    }
  }, [drain, queryClient, attemptId, closeNow]);
  useEffect(() => {
    if (countdown.warning === 'over') void expire();
  }, [countdown.warning, expire]);

  const setValue = (itemId: string, value: unknown, kind: 'choice' | 'text' = 'choice') => {
    setAnswers((previous) => ({
      ...previous,
      [itemId]: { value, flagged: previous[itemId]?.flagged ?? false },
    }));
    change({ itemId, value }, kind);
  };
  const setFlag = (itemId: string, flagged: boolean) => {
    setAnswers((previous) => ({
      ...previous,
      [itemId]: { value: previous[itemId]?.value, flagged },
    }));
    change({ itemId, flagged });
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
    onBlurText: () => void drain({ retryNow: false }),
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

      <main
        className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-4 pb-32"
        style={{ fontSize: `${prefs.fontScale / 100}rem` }}
      >
        {!connected && <OfflineNotice />}
        {timedOut && <BusyNotice title={t('take.timedOut')} hint={t('take.timedOutHint')} />}
        {saver.rejected.length > 0 && (
          <ErrorMessage>
            {t('take.save.rejected', {
              items: saver.rejected
                .map(({ itemId }) => items.find((item) => item.itemId === itemId)?.no)
                .filter((no) => no !== undefined)
                .join(', '),
            })}
          </ErrorMessage>
        )}
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
      </main>

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
              <span
                aria-hidden
                className={`size-3 rounded-sm border-2 ${CELL_BORDER[state]} ${CELL_TONE[state]}`}
              />
              {t(STATE_KEY[state])}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-sm border-2 border-dashed border-warning" />
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
                aria-label={t(flagged ? 'take.grid.cellFlagged' : 'take.grid.cell', {
                  no: item.no,
                  state: t(STATE_KEY[state]),
                })}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => goTo(index)}
                className={`inline-flex size-12 cursor-pointer items-center justify-center rounded-lg border-2 font-sans text-sm font-semibold ${CELL_TONE[state]} ${
                  flagged ? 'border-dashed border-warning' : CELL_BORDER[state]
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
              {submit.error instanceof UnsavedError
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

/** Tải lại lúc mất mạng: đề lấy từ bản sao trên máy; câu trả lời được giữ và tự gửi khi có mạng (Q243). */
function OfflineNotice() {
  const { t } = useTranslation();
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft p-3 font-sans text-sm text-warning"
    >
      <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span>
        <strong className="block">{t('take.offline.title')}</strong>
        {t('take.offline.body')}
      </span>
    </p>
  );
}

const CELL_TONE: Record<AnswerState, string> = {
  done: 'bg-primary-soft text-on-primary-soft',
  partial: 'bg-warning-soft text-warning',
  blank: 'bg-surface text-fg',
};
/** Viền tách riêng khỏi nền: câu đánh dấu thay viền bằng nét đứt màu cảnh báo, không để hai lớp viền tranh nhau. */
const CELL_BORDER: Record<AnswerState, string> = {
  done: 'border-primary',
  partial: 'border-warning',
  blank: 'border-border-strong',
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
