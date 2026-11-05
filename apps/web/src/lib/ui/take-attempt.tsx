// Chữ có chân cho nội dung đề (Q101): chỉ nạp cùng khu làm bài, các màn khác không tải. Hai bộ ký tự, mỗi bộ hai độ đậm.
import '@fontsource/noto-serif/latin-400.css';
import '@fontsource/noto-serif/vietnamese-400.css';
import '@fontsource/noto-serif/latin-600.css';
import '@fontsource/noto-serif/vietnamese-600.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Eye,
  LayoutGrid,
  type LucideIcon,
  Timer,
  TriangleAlert,
  Type,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  type AttemptView,
  attemptQueryKey,
  fetchAttemptOnline,
  type PreviewView,
  submitAttempt,
  type TakeContent,
  type TakeItem,
  UnsavedError,
} from '../take';
import { type AnswerState, answerStateOf, progressOf } from '../take/answers';
import { formatClock, type Warning } from '../take/clock';
import type { Notice } from '../take/heartbeat-queue';
import { forgetAttemptLocally } from '../take/local-data';
import type { SaveStatus } from '../take/save-queue';
import { useCountdown } from '../take/use-countdown';
import { useHeartbeat } from '../take/use-heartbeat';
import { usePrefs } from '../take/use-prefs';
import { type StopReason, stopReasonOf, useSaver } from '../take/use-saver';
import { warmMedia } from '../take/warm-media';
import { BusyNotice, Button, buttonClass, Dialog, ErrorMessage, PrimaryButton, Spinner } from '.';
import { MediaSourceContext } from './illustration-image';
import { preloadFormulas } from './math-view';
import { RichTextView } from './rich-text-view';
import { TakePrefsDialog } from './take-prefs';
import { TakeQuestion } from './take-question';
import { StopScreen } from './take-screens';
import { ThemeSwitcher } from './theme-switcher';

// Màn làm bài (Q240–Q244). Câu trả lời nằm ở trạng thái cục bộ, được lưu lên server qua hàng đợi (use-saver);
// đồng hồ chỉ hiển thị giờ server tính (use-countdown).

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Answers = Record<string, { value: unknown; flagged: boolean }>;

const withValue = (answers: Answers, itemId: string, value: unknown): Answers => ({
  ...answers,
  [itemId]: { value, flagged: answers[itemId]?.flagged ?? false },
});
const withFlag = (answers: Answers, itemId: string, flagged: boolean): Answers => ({
  ...answers,
  [itemId]: { value: answers[itemId]?.value, flagged },
});

/**
 * Những gì màn làm bài cần từ bên dưới: Lượt thật (`useAttemptSession`) hay Xem thử (`PreviewRunner`) cùng đưa vào đây.
 * `null` ở `clock`, `saving`, `submit` nghĩa là không có (xem thử không có giờ, không lưu, không nộp).
 */
interface RunnerSession {
  answers: Answers;
  setValue: (itemId: string, value: unknown, kind?: 'choice' | 'text') => void;
  setFlag: (itemId: string, flagged: boolean) => void;
  blurText: () => void;
  clock: { remaining: number; warning: Warning } | null;
  saving: { status: SaveStatus; unsaved: number; rejected: { itemId: string }[] } | null;
  connected: boolean;
  /** Thông báo của Người ra đề (Cộng giờ, Cảnh cáo) chưa được Người dự thi đóng. */
  notices: Notice[];
  dismissNotice: (id: string) => void;
  timedOut: boolean;
  submit: { pending: boolean; failed: boolean; error: unknown; run: () => void } | null;
  stop: StopReason | null;
}

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

/** Mọi thứ màn làm bài cần từ phía server cho một Lượt thật: lưu, đồng hồ, nộp, báo mất mạng. */
function useAttemptSession(view: AttemptView): RunnerSession {
  const queryClient = useQueryClient();
  const attemptId = view.attempt.id;
  const items = useMemo(() => view.sections.flatMap((section) => section.items), [view]);

  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(
      items.flatMap((item) =>
        item.response
          ? [[item.itemId, { value: item.response.value, flagged: item.response.flagged }]]
          : [],
      ),
    ),
  );
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

  // Nhịp báo còn làm bài (Q213): Cộng giờ, Cảnh cáo, Buộc nộp và Thu hồi thiết bị đến đây trong tối đa 15 giây.
  const [notices, setNotices] = useState<Notice[]>([]);
  useHeartbeat({
    attemptId,
    since: view.attempt.startedAt,
    active: stop === null,
    onServerTime: (time) => {
      setConnected(true);
      countdown.resync(time);
    },
    onStop: setStop,
    onNotices: (fresh) => {
      setNotices((previous) => [...previous, ...fresh]);
      // Báo bằng rung nhẹ như cảnh báo giờ, để Người dự thi đang tập trung vào đề không bỏ lỡ.
      navigator.vibrate?.([200, 100, 200]);
    },
  });

  // Còn mạng thì tải trước ảnh và KaTeX, để tải lại lúc mất mạng vẫn thấy đủ (Q243).
  useEffect(() => {
    if (!view.offline) warmMedia(view, preloadFormulas);
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
    setAnswers((previous) => withValue(previous, itemId, value));
    change({ itemId, value }, kind);
  };
  const setFlag = (itemId: string, flagged: boolean) => {
    setAnswers((previous) => withFlag(previous, itemId, flagged));
    change({ itemId, flagged });
  };

  return {
    answers,
    setValue,
    setFlag,
    blurText: () => void drain({ retryNow: false }),
    clock: { remaining: countdown.remaining, warning: countdown.warning },
    saving: { status: saver.status, unsaved: saver.unsaved, rejected: saver.rejected },
    connected,
    notices,
    dismissNotice: (id: string) =>
      setNotices((previous) => previous.filter((notice) => notice.id !== id)),
    timedOut,
    submit: {
      pending: submit.isPending,
      failed: submit.isError,
      error: submit.error,
      run: () => submit.mutate(),
    },
    stop,
  };
}

export function AttemptRunner({ view }: { view: AttemptView }) {
  const session = useAttemptSession(view);
  if (session.stop === 'DEVICE_REVOKED' || session.stop === 'NOT_FOUND') {
    return <StopScreen reason={session.stop} />;
  }
  return <AttemptScreen content={view} session={session} />;
}

/** Xem thử qua Phiên thi (Q220, Q245): cùng màn hình, nhưng không có giờ, không lưu, không nộp. Câu trả lời chỉ ở trang. */
export function PreviewRunner({ view, onExit }: { view: PreviewView; onExit: () => void }) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Answers>({});
  const session: RunnerSession = {
    answers,
    setValue: (itemId, value) => setAnswers((previous) => withValue(previous, itemId, value)),
    setFlag: (itemId, flagged) => setAnswers((previous) => withFlag(previous, itemId, flagged)),
    blurText: () => {},
    clock: null,
    saving: null,
    connected: true,
    notices: [],
    dismissNotice: () => {},
    timedOut: false,
    submit: null,
    stop: null,
  };
  return (
    <AttemptScreen
      content={view}
      session={session}
      finishLabel={t('take.preview.finish')}
      onFinish={onExit}
      banner={
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-primary-soft p-3 font-sans text-sm text-on-primary-soft"
        >
          <Eye aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong className="block">
              {t('take.preview.title', { title: view.session.title })}
            </strong>
            {t('take.preview.body', { minutes: view.durationMinutes })}
          </span>
        </p>
      }
    />
  );
}

function AttemptScreen({
  content,
  session,
  onFinish,
  finishLabel,
  banner,
}: {
  content: TakeContent;
  session: RunnerSession;
  /** Có thì nút kết thúc làm việc này ngay (xem thử); không có thì mở hộp thoại xác nhận Nộp bài. */
  onFinish?: () => void;
  finishLabel?: string;
  banner?: ReactNode;
}) {
  const { t } = useTranslation();
  const items = useMemo(() => content.sections.flatMap((section) => section.items), [content]);
  const { prefs, update: updatePrefs, mode } = usePrefs();
  const [current, setCurrent] = useState(0);
  const [gridOpen, setGridOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const { answers, clock, saving, submit } = session;

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

  const handlers = {
    onValue: session.setValue,
    onFlag: session.setFlag,
    onBlurText: session.blurText,
  };
  const visible =
    mode === 'one' ? [items[current]].filter((item): item is TakeItem => !!item) : items;
  const sectionOf = (item: TakeItem) => content.sections.find((s) => s.items.includes(item));
  const warning = clock?.warning;
  const clockTone =
    warning === 'one' || warning === 'over'
      ? 'bg-danger-soft text-danger'
      : warning === 'five'
        ? 'bg-warning-soft text-warning'
        : 'text-fg';
  const hasInstructions = (content.exam.instructions?.content ?? []).some(
    (block) => block.type !== 'paragraph' || (block.content ?? []).length > 0,
  );

  return (
    <MediaSourceContext.Provider value={(id, side) => `${content.mediaBase}/${id}/${side}`}>
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-1 px-3">
          {clock ? (
            <div
              role="timer"
              aria-label={t('take.timeLeft')}
              className={`inline-flex min-h-12 items-center rounded-lg px-3 font-mono text-lg font-semibold tabular-nums ${clockTone}`}
            >
              {formatClock(clock.remaining)}
            </div>
          ) : (
            <span className="inline-flex min-h-12 items-center rounded-lg bg-primary-soft px-3 font-sans text-sm font-semibold text-on-primary-soft">
              {t('take.preview.badge')}
            </span>
          )}
          {saving && <SaveBadge status={saving.status} unsaved={saving.unsaved} />}
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
            <Button variant="primary" onClick={onFinish ?? (() => setSubmitOpen(true))}>
              {finishLabel ?? t('take.submit')}
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
        {banner}
        {!session.connected && <OfflineNotice />}
        {session.notices.map((notice) => (
          <ExaminerNotice
            key={notice.id}
            notice={notice}
            onDismiss={() => session.dismissNotice(notice.id)}
          />
        ))}
        {session.timedOut && (
          <BusyNotice title={t('take.timedOut')} hint={t('take.timedOutHint')} />
        )}
        {saving && saving.rejected.length > 0 && (
          <ErrorMessage>
            {t('take.save.rejected', {
              items: saving.rejected
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
            {content.exam.instructions && <RichTextView doc={content.exam.instructions} />}
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

      {submit && (
        <Dialog
          open={submitOpen}
          onClose={() => !submit.pending && setSubmitOpen(false)}
          title={t('take.confirm.title')}
          dismissible={!submit.pending}
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
            {progress.flagged > 0 && (
              <p>{t('take.confirm.flagged', { count: progress.flagged })}</p>
            )}
            <JumpList
              items={items.flatMap((item, index) =>
                stateOf(item) !== 'done' || answers[item.itemId]?.flagged ? [{ item, index }] : [],
              )}
              onJump={goTo}
            />
            <p className="text-sm text-fg-muted">{t('take.confirm.final')}</p>
            {submit.failed && (
              <ErrorMessage>
                {submit.error instanceof UnsavedError
                  ? t('take.confirm.unsaved')
                  : errorMessage(t, submit.error)}
              </ErrorMessage>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setSubmitOpen(false)} disabled={submit.pending}>
                {t('take.confirm.continue')}
              </Button>
              <PrimaryButton loading={submit.pending} onClick={() => submit.run()}>
                {submit.pending ? t('take.confirm.submitting') : t('take.submit')}
              </PrimaryButton>
            </div>
          </div>
        </Dialog>
      )}

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

/** Thông báo của Người ra đề giữa giờ thi: Người dự thi phải thấy rõ và tự đóng (Q257, Q259). */
function ExaminerNotice({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const { t } = useTranslation();
  const warning = notice.kind === 'warning';
  return (
    <div
      role={warning ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border p-3 font-sans text-sm ${
        warning
          ? 'border-danger bg-danger-soft text-danger'
          : 'border-primary bg-primary-soft text-on-primary-soft'
      }`}
    >
      {warning ? (
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
      ) : (
        <Timer aria-hidden className="mt-0.5 size-5 shrink-0" />
      )}
      <span className="flex-1">
        <strong className="block">{t(`take.notice.${notice.kind}.title`)}</strong>
        {notice.kind === 'time_extended'
          ? t('take.notice.time_extended.body', { minutes: notice.minutes, reason: notice.reason })
          : notice.kind === 'reopened'
            ? t('take.notice.reopened.body')
            : notice.reason}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="min-h-12 shrink-0 rounded-md px-3 font-medium underline"
      >
        {t('take.notice.dismiss')}
      </button>
    </div>
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
