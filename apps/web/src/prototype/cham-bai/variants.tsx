import { ChevronDown, ChevronUp, MessageSquare, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type FakeEntry, fmt, QUESTION, QUICK } from './data';
import {
  BlindToggle,
  FilterChips,
  type GradingState,
  KeyHint,
  NavButtons,
  Progress,
  QuestionPanel,
  SavedBadge,
  ScoreField,
  useGradingKeys,
} from './grading';

// PROTOTYPE: ba phương án khác nhau về cấu trúc, cùng một đề và 36 bài giả.

const stateOf = (g: GradingState, e: FakeEntry) => g.scores[e.id];
const dot = (s: number | null | undefined) => (s === undefined || s === null ? '○' : '●');

// ---------------------------------------------------------------------------------------------------------------------
// A. Chia đôi (bố cục đã duyệt ở Q293): hàng đợi bên trái, bài và ô điểm bên phải; điện thoại: danh sách thu vào một nút.
// ---------------------------------------------------------------------------------------------------------------------
export function VariantA({ g }: { g: GradingState }) {
  const [listOpen, setListOpen] = useState(false);
  const current = g.current;
  useGradingKeys(g);
  const list = (
    <ul
      className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-18rem)]"
      aria-label="Danh sách bài"
    >
      {g.visible.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            aria-current={current?.id === e.id}
            onClick={() => {
              g.select(e.id);
              setListOpen(false);
            }}
            className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${
              current?.id === e.id
                ? 'bg-primary-soft font-semibold text-on-primary-soft'
                : 'hover:bg-border/50'
            }`}
          >
            <span className="truncate">{g.who(e)}</span>
            <span className="tabular-nums text-fg-muted">
              {dot(stateOf(g, e))}{' '}
              {stateOf(g, e) === undefined || stateOf(g, e) === null
                ? ''
                : fmt(stateOf(g, e) as number)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-3">
        <Progress g={g} />
        <FilterChips g={g} />
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium lg:hidden"
        >
          Danh sách bài ({g.visible.length})
          {listOpen ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
        </button>
        <div className={`${listOpen ? 'block' : 'hidden'} lg:block`}>{list}</div>
      </aside>
      <section className="flex min-w-0 flex-col gap-3">
        <QuestionPanel />
        {current ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{g.who(current)}</h2>
              <NavButtons g={g} />
            </div>
            <article className="rounded-xl border border-border bg-surface p-4 text-base leading-relaxed whitespace-pre-wrap">
              {current.text}
            </article>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="a-score" className="text-sm font-medium">
                  Điểm (tối đa {fmt(QUESTION.points)})
                </label>
                <ScoreField
                  id="a-score"
                  autoFocus
                  value={g.scores[current.id]}
                  onCommit={(v) => g.setScore(current.id, v)}
                  onEnter={g.next}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      g.setScore(current.id, q.value);
                      g.next();
                    }}
                    className="min-h-11 min-w-12 cursor-pointer rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-primary-soft pointer-fine:min-h-10"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <SavedBadge saving={g.saving} />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nhận xét cho Người dự thi (không bắt buộc)
              <textarea
                value={g.feedback[current.id] ?? ''}
                onChange={(e) => g.setFeedback(current.id, e.target.value)}
                rows={2}
                maxLength={1000}
                className="rounded-lg border border-border-strong bg-surface p-3 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <KeyHint>J / K: bài sau / trước · gõ điểm rồi Enter: lưu và sang bài kế</KeyHint>
          </>
        ) : (
          <p className="rounded-xl border border-border bg-surface p-6 text-center">
            Đã chấm hết các bài. Chuyển sang "Tất cả" để xem lại.
          </p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// B. Tập trung, một bài mỗi màn: nút điểm to ở đáy, chấm xong tự sang bài chưa chấm kế tiếp, có Hoàn tác; dải ô tiến độ.
// ---------------------------------------------------------------------------------------------------------------------
export function VariantB({ g }: { g: GradingState }) {
  const current = g.current;
  const [custom, setCustom] = useState(false);
  const [note, setNote] = useState(false);
  useGradingKeys(g, (e) => {
    const n = Number(e.key);
    if (current && n >= 1 && n <= 5) g.gradeAndNext(current.id, QUICK[n - 1]?.value ?? 0);
  });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-44">
      <Progress g={g} />
      <div className="hidden flex-wrap gap-1 sm:flex" role="group" aria-label="Tiến độ từng bài">
        {g.entries.map((e) => {
          const s = g.scores[e.id];
          return (
            <button
              key={e.id}
              type="button"
              aria-label={`${e.label}${s === undefined || s === null ? ', chưa chấm' : `, ${fmt(s)} điểm`}`}
              aria-current={current?.id === e.id}
              onClick={() => g.select(e.id)}
              className={`size-5 cursor-pointer rounded-sm border sm:size-6 ${
                current?.id === e.id ? 'border-fg ring-2 ring-primary' : 'border-border-strong'
              } ${s === undefined || s === null ? 'bg-surface' : 'bg-success/70'}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterChips g={g} />
        <div className="flex items-center gap-3">
          <SavedBadge saving={g.saving} />
          <BlindToggle g={g} />
        </div>
      </div>
      <QuestionPanel />
      {current ? (
        <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-fg-muted">{g.who(current)}</p>
          <p className="text-lg leading-relaxed whitespace-pre-wrap">{current.text}</p>
          {note && (
            <textarea
              value={g.feedback[current.id] ?? ''}
              onChange={(e) => g.setFeedback(current.id, e.target.value)}
              placeholder="Nhận xét cho Người dự thi"
              rows={2}
              className="mt-4 w-full rounded-lg border border-border-strong bg-surface p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
          )}
        </article>
      ) : (
        <p className="rounded-xl border border-border bg-surface p-6 text-center">
          Đã chấm hết các bài.
        </p>
      )}
      {g.undo && (
        <p
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
        >
          Đã chấm {g.undo.label}.
          <button
            type="button"
            onClick={g.doUndo}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 font-semibold underline"
          >
            <Undo2 aria-hidden className="size-4" />
            Hoàn tác
          </button>
        </p>
      )}
      <div className="fixed inset-x-0 bottom-[var(--app-tabbar-h,0px)] z-40 border-t border-border bg-surface/95 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur lg:bottom-0 lg:left-[var(--app-sidebar-w,0px)]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <div className="grid grid-cols-5 gap-2">
            {QUICK.map((q, i) => (
              <button
                key={q.label}
                type="button"
                disabled={!current}
                onClick={() => current && g.gradeAndNext(current.id, q.value)}
                className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-border-strong bg-surface text-base font-bold hover:bg-primary-soft disabled:opacity-40"
              >
                {q.label}
                <span className="text-[11px] font-normal text-fg-muted">{fmt(q.value)} đ</span>
                <span className="sr-only">phím {i + 1}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <NavButtons g={g} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={note}
                onClick={() => setNote((n) => !n)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong px-3 text-sm pointer-fine:min-h-9"
              >
                <MessageSquare aria-hidden className="size-4" />
                <span className="hidden sm:inline">Nhận xét</span>
              </button>
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => setCustom((c) => !c)}
                className="min-h-11 cursor-pointer rounded-lg border border-border-strong px-3 text-sm pointer-fine:min-h-9"
              >
                Điểm khác…
              </button>
            </div>
          </div>
          {custom && current && (
            <div className="flex items-center gap-2">
              <ScoreField
                value={g.scores[current.id]}
                onCommit={(v) => v !== null && g.gradeAndNext(current.id, v)}
                onEnter={() => setCustom(false)}
              />
              <span className="text-sm text-fg-muted">Enter để lưu và sang bài kế</span>
            </div>
          )}
          <KeyHint>Phím 1–5 chấm nhanh · J / K chuyển bài</KeyHint>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// C. Bảng: mọi bài là một hàng, ô điểm nằm ngay trong hàng, Enter xuống hàng kế; bấm hàng để đọc đầy đủ. Hợp bài ngắn và so sánh.
// ---------------------------------------------------------------------------------------------------------------------
export function VariantC({ g }: { g: GradingState }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => {
    const first = g.visible[0];
    if (first) refs.current[first.id]?.focus();
    // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ focus lúc mở
  }, []);
  const focusNext = (id: string) => {
    const at = g.visible.findIndex((e) => e.id === id);
    const nextEntry = g.visible[at + 1];
    if (nextEntry) refs.current[nextEntry.id]?.focus();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-[var(--app-header-h,0px)] z-10 flex flex-col gap-2 border-b border-border bg-bg py-2">
        <Progress g={g} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips g={g} />
          <div className="flex items-center gap-3">
            <SavedBadge saving={g.saving} />
            <BlindToggle g={g} />
          </div>
        </div>
      </div>
      <QuestionPanel />
      <KeyHint>
        Gõ điểm rồi Enter: xuống bài kế · Tab: ô kế · bấm vào bài để đọc đầy đủ và viết nhận xét
      </KeyHint>
      <ul className="flex flex-col gap-2">
        {g.visible.map((e) => {
          const open = openId === e.id;
          return (
            <li key={e.id} className="rounded-xl border border-border bg-surface">
              <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-40 sm:shrink-0">
                  <p className="text-sm font-semibold">{g.who(e)}</p>
                  <p className="text-sm text-fg-muted">
                    {dot(stateOf(g, e))}{' '}
                    {stateOf(g, e) === undefined || stateOf(g, e) === null
                      ? 'chưa chấm'
                      : 'đã chấm'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : e.id)}
                  className={`min-w-0 flex-1 cursor-pointer text-left text-base ${open ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}
                >
                  {e.text}
                </button>
                <ScoreField
                  value={g.scores[e.id]}
                  onCommit={(v) => g.setScore(e.id, v)}
                  onEnter={() => focusNext(e.id)}
                />
                <div className="flex flex-wrap gap-1 sm:w-44">
                  {QUICK.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => g.setScore(e.id, q.value)}
                      className="min-h-9 min-w-9 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-sm font-semibold hover:bg-primary-soft"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              {open && (
                <div className="border-t border-border p-3">
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Nhận xét cho Người dự thi (không bắt buộc)
                    <textarea
                      value={g.feedback[e.id] ?? ''}
                      onChange={(ev) => g.setFeedback(e.id, ev.target.value)}
                      rows={2}
                      className="rounded-lg border border-border-strong bg-surface p-3 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// D. Kết hợp A + B: máy tính chia đôi (danh sách bên trái, bài và bảng điểm bên phải); điện thoại một bài mỗi màn với nút điểm
// to cố định ở đáy. Cùng một trạng thái: nút điểm nhanh tự sang bài chưa chấm kế tiếp và có Hoàn tác; ô "Điểm khác" nhận 1,25.
// ---------------------------------------------------------------------------------------------------------------------
export function VariantD({ g }: { g: GradingState }) {
  const [listOpen, setListOpen] = useState(false);
  const [note, setNote] = useState(false);
  const [custom, setCustom] = useState(false);
  const current = g.current;
  useGradingKeys(g, (e) => {
    const n = Number(e.key);
    if (current && n >= 1 && n <= 5) g.gradeAndNext(current.id, QUICK[n - 1]?.value ?? 0);
  });
  const list = (
    <ul
      className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-20rem)]"
      aria-label="Danh sách bài"
    >
      {g.visible.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            aria-current={current?.id === e.id}
            onClick={() => {
              g.select(e.id);
              setListOpen(false);
            }}
            className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${
              current?.id === e.id
                ? 'bg-primary-soft font-semibold text-on-primary-soft'
                : 'hover:bg-border/50'
            }`}
          >
            <span className="truncate">{g.who(e)}</span>
            <span className="tabular-nums text-fg-muted">
              {dot(stateOf(g, e))}{' '}
              {stateOf(g, e) === undefined || stateOf(g, e) === null
                ? ''
                : fmt(stateOf(g, e) as number)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-4 pb-44 lg:grid-cols-[17rem_1fr] lg:pb-0">
      <aside className="flex flex-col gap-3">
        <Progress g={g} />
        <FilterChips g={g} />
        <button
          type="button"
          onClick={() => setListOpen((o) => !o)}
          aria-expanded={listOpen}
          className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium lg:hidden"
        >
          Danh sách bài ({g.visible.length})
          {listOpen ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
        </button>
        <div className={`${listOpen ? 'block' : 'hidden'} lg:block`}>{list}</div>
      </aside>
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <QuestionPanel />
        </div>
        {current ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{g.who(current)}</h2>
              <div className="flex items-center gap-3">
                <SavedBadge saving={g.saving} />
                <NavButtons g={g} />
              </div>
            </div>
            <article className="rounded-xl border border-border bg-surface p-4 text-lg leading-relaxed whitespace-pre-wrap">
              {current.text}
            </article>
            {note && (
              <textarea
                value={g.feedback[current.id] ?? ''}
                onChange={(e) => g.setFeedback(current.id, e.target.value)}
                placeholder="Nhận xét cho Người dự thi (không bắt buộc)"
                rows={2}
                maxLength={1000}
                className="rounded-lg border border-border-strong bg-surface p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
              />
            )}
          </>
        ) : (
          <p className="rounded-xl border border-border bg-surface p-6 text-center">
            Đã chấm hết các bài. Chuyển sang "Tất cả" để xem lại.
          </p>
        )}
        {g.undo && (
          <p
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
          >
            Đã chấm {g.undo.label}.
            <button
              type="button"
              onClick={g.doUndo}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1 font-semibold underline"
            >
              <Undo2 aria-hidden className="size-4" />
              Hoàn tác
            </button>
          </p>
        )}
        {/* Bảng điểm: cố định ở đáy trên điện thoại (một tay với tới), nằm ngay dưới bài trên máy tính. */}
        <div className="fixed inset-x-0 bottom-[var(--app-tabbar-h,0px)] z-40 border-t border-border bg-surface/95 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur lg:static lg:rounded-xl lg:border lg:shadow-none">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-5 gap-2">
              {QUICK.map((q, i) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={!current}
                  onClick={() => current && g.gradeAndNext(current.id, q.value)}
                  className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-border-strong bg-surface text-base font-bold hover:bg-primary-soft disabled:opacity-40 lg:min-h-14"
                >
                  {q.label}
                  <span className="text-[11px] font-normal text-fg-muted">{fmt(q.value)} đ</span>
                  <span className="sr-only">phím {i + 1}</span>
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
                Điểm khác…
              </button>
              <button
                type="button"
                aria-pressed={note}
                onClick={() => setNote((n) => !n)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-border-strong px-3 text-sm pointer-fine:min-h-9"
              >
                <MessageSquare aria-hidden className="size-4" />
                <span className="hidden sm:inline">Nhận xét</span>
              </button>
              <BlindToggle g={g} />
              {custom && current && (
                <ScoreField
                  autoFocus
                  value={g.scores[current.id]}
                  onCommit={(v) => v !== null && g.gradeAndNext(current.id, v)}
                  onEnter={() => setCustom(false)}
                />
              )}
            </div>
            <KeyHint>1–5: chấm nhanh · J / K: chuyển bài · Điểm khác: gõ rồi Enter</KeyHint>
          </div>
        </div>
      </section>
    </div>
  );
}

export const VARIANTS = [
  { key: 'A', name: 'Chia đôi (Q293)', Component: VariantA },
  { key: 'B', name: 'Một bài mỗi màn, nút điểm to', Component: VariantB },
  { key: 'C', name: 'Bảng, chấm ngay trong hàng', Component: VariantC },
  { key: 'D', name: 'Kết hợp A + B', Component: VariantD },
] as const;
