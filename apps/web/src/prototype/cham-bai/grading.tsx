import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Keyboard } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FakeEntry, fmt, QUESTION } from './data';

// PROTOTYPE: trạng thái chấm dùng chung cho ba phương án (trong bộ nhớ, giả lập độ trễ lưu 150 ms) và các mảnh nhỏ.

export type Filter = 'pending' | 'all';

export interface GradingState {
  entries: FakeEntry[];
  visible: FakeEntry[];
  current: FakeEntry | undefined;
  index: number;
  scores: Record<string, number | null>;
  feedback: Record<string, string>;
  filter: Filter;
  setFilter: (f: Filter) => void;
  blind: boolean;
  setBlind: (b: boolean) => void;
  graded: number;
  total: number;
  saving: boolean;
  select: (id: string) => void;
  next: () => void;
  prev: () => void;
  setScore: (id: string, score: number | null) => void;
  setFeedback: (id: string, text: string) => void;
  /** Chấm rồi sang bài chưa chấm kế tiếp. */
  gradeAndNext: (id: string, score: number) => void;
  undo: { id: string; label: string } | null;
  doUndo: () => void;
  who: (e: FakeEntry) => string;
}

export function useGrading(entries: FakeEntry[]): GradingState {
  const [scores, setScores] = useState<Record<string, number | null>>({ b1: 1.5, b2: 0.5, b5: 2 });
  const [feedback, setFeedbackState] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('pending');
  const [blind, setBlind] = useState(true);
  const [currentId, setCurrentId] = useState<string>('b3');
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ id: string; label: string; prev: number | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isGraded = useCallback(
    (id: string) => scores[id] !== undefined && scores[id] !== null,
    [scores],
  );
  const visible = useMemo(
    () =>
      filter === 'all' ? entries : entries.filter((e) => !isGraded(e.id) || e.id === currentId),
    [entries, filter, isGraded, currentId],
  );
  const index = Math.max(
    0,
    visible.findIndex((e) => e.id === currentId),
  );
  const current = visible[index];

  const flashSaving = useCallback(() => {
    setSaving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaving(false), 150);
  }, []);

  const setScore = useCallback(
    (id: string, score: number | null) => {
      setScores((s) => ({ ...s, [id]: score }));
      flashSaving();
    },
    [flashSaving],
  );

  const nextPendingAfter = useCallback(
    (id: string) => {
      const from = entries.findIndex((e) => e.id === id);
      for (let step = 1; step <= entries.length; step++) {
        const e = entries[(from + step) % entries.length] as FakeEntry;
        if (!isGraded(e.id) && e.id !== id) return e.id;
      }
      return id;
    },
    [entries, isGraded],
  );

  const state: GradingState = {
    entries,
    visible,
    current,
    index,
    scores,
    feedback,
    filter,
    setFilter,
    blind,
    setBlind,
    graded: entries.filter((e) => isGraded(e.id)).length,
    total: entries.length,
    saving,
    select: setCurrentId,
    next: () => visible[index + 1] && setCurrentId((visible[index + 1] as FakeEntry).id),
    prev: () => visible[index - 1] && setCurrentId((visible[index - 1] as FakeEntry).id),
    setScore,
    setFeedback: (id, text) => {
      setFeedbackState((f) => ({ ...f, [id]: text }));
      flashSaving();
    },
    gradeAndNext: (id, score) => {
      const entry = entries.find((e) => e.id === id) as FakeEntry;
      setUndo({ id, label: entry.label, prev: scores[id] ?? null });
      setScore(id, score);
      setCurrentId(nextPendingAfter(id));
    },
    undo: undo ? { id: undo.id, label: undo.label } : null,
    doUndo: () => {
      if (!undo) return;
      setScore(undo.id, undo.prev);
      setCurrentId(undo.id);
      setUndo(null);
    },
    who: (e) => (blind ? e.label : `${e.label} · ${e.name} (${e.code})`),
  };
  return state;
}

/** Phím tắt J/K, bỏ qua khi đang gõ vào ô nhập (Q293). */
export function useGradingKeys(g: GradingState, extra?: (e: KeyboardEvent) => void) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: prototype
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'j' || e.key === 'J') g.next();
      else if (e.key === 'k' || e.key === 'K') g.prev();
      else extra?.(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

export function Progress({ g }: { g: GradingState }) {
  const pct = Math.round((g.graded / g.total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          Đã chấm {g.graded}/{g.total}
        </span>
        <span className="text-fg-muted tabular-nums">{pct}%</span>
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
  );
}

export function SavedBadge({ saving }: { saving: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm ${saving ? 'text-fg-muted' : 'text-success'}`}
      aria-live="polite"
    >
      <Check aria-hidden className="size-4" />
      {saving ? 'Đang lưu…' : 'Đã lưu'}
    </span>
  );
}

export function BlindToggle({ g }: { g: GradingState }) {
  return (
    <button
      type="button"
      aria-pressed={g.blind}
      onClick={() => g.setBlind(!g.blind)}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium pointer-fine:min-h-9"
    >
      {g.blind ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      Chấm ẩn tên: {g.blind ? 'bật' : 'tắt'}
    </button>
  );
}

export function FilterChips({ g }: { g: GradingState }) {
  return (
    <fieldset className="flex gap-1 border-0 p-0">
      <legend className="sr-only">Lọc bài</legend>
      {(['pending', 'all'] as const).map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={g.filter === f}
          onClick={() => g.setFilter(f)}
          className={`min-h-11 cursor-pointer rounded-lg border px-3 text-sm font-medium pointer-fine:min-h-9 ${
            g.filter === f
              ? 'border-primary bg-primary-soft text-on-primary-soft'
              : 'border-border-strong bg-surface'
          }`}
        >
          {f === 'pending' ? `Chưa chấm (${g.total - g.graded})` : `Tất cả (${g.total})`}
        </button>
      ))}
    </fieldset>
  );
}

/** Đề, hướng dẫn chấm: thu gọn được để nhường chỗ cho bài làm. */
export function QuestionPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-border bg-surface p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Câu {QUESTION.no} · {fmt(QUESTION.points)} điểm · đề và hướng dẫn chấm
      </summary>
      <p className="mt-2 text-sm">{QUESTION.stem}</p>
      <ul className="mt-2 list-disc pl-5 text-sm text-fg-muted">
        {QUESTION.rubric.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </details>
  );
}

export function ScoreField({
  value,
  onCommit,
  id,
  autoFocus,
  onEnter,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  id?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const [text, setText] = useState(
    value === null || value === undefined ? '' : String(value).replace('.', ','),
  );
  const [error, setError] = useState('');
  // biome-ignore lint/correctness/useExhaustiveDependencies: đồng bộ khi đổi bài
  useEffect(() => {
    setText(value === null || value === undefined ? '' : String(value).replace('.', ','));
    setError('');
  }, [value]);
  const commit = () => {
    if (text.trim() === '') {
      setError('');
      return onCommit(null);
    }
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > QUESTION.points) {
      setError(`Nhập từ 0 đến ${fmt(QUESTION.points)}`);
      return;
    }
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) {
      setError('Tối đa 2 chữ số thập phân');
      return;
    }
    setError('');
    onCommit(n);
  };
  return (
    <div className="flex flex-col gap-1">
      <input
        id={id}
        // biome-ignore lint/a11y/noAutofocus: prototype
        autoFocus={autoFocus}
        inputMode="decimal"
        value={text}
        aria-label="Điểm"
        aria-invalid={error !== ''}
        placeholder={`0 – ${fmt(QUESTION.points)}`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            onEnter?.();
          }
        }}
        className="h-12 w-28 rounded-lg border border-border-strong bg-surface px-3 text-center text-xl font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-10"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function NavButtons({ g }: { g: GradingState }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Bài trước"
        onClick={g.prev}
        disabled={g.index === 0}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40 pointer-fine:size-9"
      >
        <ArrowLeft aria-hidden className="size-4" />
      </button>
      <span className="text-sm tabular-nums text-fg-muted">
        {g.visible.length === 0 ? '0/0' : `${g.index + 1}/${g.visible.length}`}
      </span>
      <button
        type="button"
        aria-label="Bài sau"
        onClick={g.next}
        disabled={g.index >= g.visible.length - 1}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong bg-surface disabled:opacity-40 pointer-fine:size-9"
      >
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function KeyHint({ children }: { children: string }) {
  return (
    <p className="hidden items-center gap-1 text-sm text-fg-muted pointer-fine:inline-flex">
      <Keyboard aria-hidden className="size-4" />
      {children}
    </p>
  );
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const at = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const go = useCallback(
    (delta: number) =>
      onChange((variants[(at + delta + variants.length) % variants.length] as { key: string }).key),
    [at, onChange, variants],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const v = variants[at];
  return (
    <div className="fixed top-[calc(var(--app-header-h,4rem)+0.5rem)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fg px-3 py-2 text-sm font-semibold text-bg shadow-lg">
      <button
        type="button"
        aria-label="Phương án trước"
        onClick={() => go(-1)}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-bg/20"
      >
        <ArrowLeft aria-hidden className="size-4" />
      </button>
      <span>
        {v?.key} · {v?.name}
      </span>
      <button
        type="button"
        aria-label="Phương án sau"
        onClick={() => go(1)}
        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-bg/20"
      >
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </div>
  );
}
