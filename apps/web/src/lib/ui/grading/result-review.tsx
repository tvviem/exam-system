import { Check, ChevronLeft, ChevronRight, Contrast, LayoutGrid, Minus, X } from 'lucide-react';
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { MyResultItem } from '../../grading';
import {
  countVerdicts,
  indexOfNo,
  matchesFilter,
  nextWrongIndex,
  REVIEW_VERDICTS,
  type ReviewVerdict,
  stepIndex,
} from '../../result-review';
import { buttonClass, Dialog } from '..';
import { RichTextView } from '../rich-text-view';

// Duyệt Kết quả từng câu (Q318): bản đồ câu tô theo kết quả, bốn nút lọc, mỗi lần một câu giống khung làm bài nhưng chỉ xem.
// Không bao giờ hiện Đáp án đúng: chỉ lựa chọn của chính Người dự thi và kết quả server đã chấm.

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('vi-VN', { maximumFractionDigits: digits });

interface VerdictStyle {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Ô trên bản đồ. */
  cell: string;
  /** Vạch trên dải tổng quan. */
  bar: string;
  /** Dải kết quả đầu thẻ câu. */
  banner: string;
}

// Không chỉ dựa vào màu: mỗi kết quả có biểu tượng riêng (✓ ◐ ✗ –) và chữ.
const STYLE: Record<ReviewVerdict, VerdictStyle> = {
  correct: {
    icon: Check,
    cell: 'border-success bg-success-soft text-success',
    bar: 'bg-success',
    banner: 'border-success/50 bg-success-soft text-success',
  },
  partial: {
    icon: Contrast,
    cell: 'border-warning bg-warning-soft text-warning',
    bar: 'bg-warning',
    banner: 'border-warning/50 bg-warning-soft text-warning',
  },
  wrong: {
    icon: X,
    cell: 'border-danger bg-danger-soft text-danger',
    bar: 'bg-danger',
    banner: 'border-danger/50 bg-danger-soft text-danger',
  },
  blank: {
    icon: Minus,
    cell: 'border-border-strong bg-surface text-fg-muted',
    bar: 'bg-border-strong',
    banner: 'border-border-strong bg-surface text-fg-muted',
  },
};

const LETTERS = 'ABCDEFGH';

export function ResultReview({
  items,
  currentNo,
  onCurrentNo,
  extra,
  marked,
}: {
  items: MyResultItem[];
  /** Số câu đang xem (đưa lên địa chỉ để tải lại hay Back vẫn giữ chỗ). */
  currentNo?: number;
  onCurrentNo: (no: number) => void;
  /** Phần thêm cuối thẻ câu (Phúc khảo của câu này). */
  extra?: (item: MyResultItem) => ReactNode;
  /** Số các câu cần đánh dấu trên bản đồ (đã Phúc khảo). */
  marked?: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ReviewVerdict | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const index = indexOfNo(items, currentNo);
  const item = items[index];
  const counts = countVerdicts(items);
  const viewerRef = useRef<HTMLElement>(null);
  const moved = useRef(false);

  const goTo = (target: number | null) => {
    const next = target === null ? undefined : items[target];
    if (!next) return;
    moved.current = true;
    setMapOpen(false);
    onCurrentNo(next.no);
  };
  const prev = stepIndex(items, index, filter, -1);
  const next = stepIndex(items, index, filter, 1);
  const wrongNext = nextWrongIndex(items, index);

  // Chuyển câu bằng nút, bản đồ hay phím: giữ nguyên chỗ đang xem. Chỉ khi đầu thẻ câu đã trôi lên khỏi màn hình (đang đọc dở
  // câu dài) mới cuộn để thấy lại đầu câu mới; không bao giờ nhảy về đầu trang.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi đổi câu, không phụ thuộc phần còn lại
  useEffect(() => {
    if (!moved.current) return;
    const node = viewerRef.current;
    if (node && node.getBoundingClientRect().top < 0) node.scrollIntoView({ block: 'start' });
  }, [item?.no]);

  // Phím ← → duyệt câu (như phím J/K ở màn Chấm); bỏ qua khi đang gõ hay có phím bổ trợ.
  const stepRef = useRef({ prev, next });
  stepRef.current = { prev, next };
  const goRef = useRef(goTo);
  goRef.current = goTo;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog[open]'))
        return;
      if (event.key === 'ArrowLeft') goRef.current(stepRef.current.prev);
      else if (event.key === 'ArrowRight') goRef.current(stepRef.current.next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickFilter = (verdict: ReviewVerdict) => {
    const turnOff = filter === verdict;
    setFilter(turnOff ? null : verdict);
    // Bật lọc mà câu đang xem không khớp: nhảy tới câu khớp đầu tiên để màn không hiện câu ngoài bộ lọc.
    if (!turnOff && item && item.verdict !== verdict) {
      goTo(items.findIndex((candidate) => candidate.verdict === verdict));
    }
  };

  if (!item) return null;
  const style = STYLE[item.verdict];
  const Icon = style.icon;

  return (
    <section
      aria-labelledby="my-items"
      className="grid gap-4 pb-20 lg:grid-cols-[18rem_minmax(0,1fr)] lg:pb-0"
    >
      <h2 id="my-items" className="text-base font-semibold lg:col-span-2">
        {t('myResult.items')}
      </h2>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        {/* Dải tổng quan: một vạch mỗi câu, nhìn một lượt biết chỗ nào sai. */}
        <div aria-hidden className="flex gap-0.5">
          {items.map((entry) => (
            <span
              key={entry.no}
              className={`h-2 min-w-0.5 flex-1 rounded-full ${STYLE[entry.verdict].bar} ${
                entry.no === item.no ? 'ring-2 ring-ring ring-offset-1 ring-offset-bg' : ''
              } ${matchesFilter(entry, filter) ? '' : 'opacity-30'}`}
            />
          ))}
        </div>
        <fieldset className="m-0 grid grid-cols-4 gap-2 border-0 p-0 lg:grid-cols-2">
          <legend className="sr-only">{t('myResult.filterLabel')}</legend>
          {REVIEW_VERDICTS.map((verdict) => {
            const FilterIcon = STYLE[verdict].icon;
            return (
              <button
                key={verdict}
                type="button"
                aria-pressed={filter === verdict}
                disabled={counts[verdict] === 0}
                onClick={() => pickFilter(verdict)}
                className={`grid min-h-14 cursor-pointer grid-cols-[auto_auto] items-center justify-center gap-x-1.5 gap-y-0.5 rounded-lg border-2 px-1 text-sm font-semibold disabled:cursor-default disabled:opacity-50 lg:flex lg:min-h-12 lg:gap-2 lg:px-3 ${
                  filter === verdict
                    ? 'border-primary bg-primary text-on-primary'
                    : `${STYLE[verdict].cell} hover:brightness-95`
                }`}
              >
                <FilterIcon aria-hidden className="size-4 shrink-0" />
                {/* Nhãn ngắn ở nút lọc (dải kết quả đầu thẻ câu mới ghi đầy đủ): điện thoại xếp dưới biểu tượng và số. */}
                <span className="col-span-2 row-start-2 min-w-0 text-center text-xs leading-tight lg:flex-1 lg:text-left lg:text-sm">
                  {t(`myResult.verdictShort.${verdict}`)}
                </span>
                <span className="col-start-2 row-start-1 tabular-nums lg:ml-auto">
                  {counts[verdict]}
                </span>
              </button>
            );
          })}
        </fieldset>
        {filter && (
          <p className="text-sm text-fg-muted">
            {t('myResult.filterHint', {
              verdict: t(`myResult.verdict.${filter}`),
              count: counts[filter],
            })}{' '}
            <button
              type="button"
              onClick={() => setFilter(null)}
              className="cursor-pointer font-medium text-primary underline"
            >
              {t('myResult.filterClear')}
            </button>
          </p>
        )}
        {/* Bản đồ câu chỉ hiện ở màn rộng; điện thoại mở từ thanh dưới. */}
        <div className="hidden lg:block">
          <ResultMap
            items={items}
            current={item.no}
            filter={filter}
            onPick={goTo}
            marked={marked}
          />
        </div>
      </aside>

      <article
        ref={viewerRef}
        aria-labelledby="result-item-title"
        data-testid="result-item"
        data-verdict={item.verdict}
        className="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 id="result-item-title" className="text-base font-semibold">
            {t('grading.person.item', { no: item.no })}
            <span className="ml-2 text-sm font-normal text-fg-muted">
              {t(`grading.type.${item.type}`)}
            </span>
          </h3>
          <p className="text-sm text-fg-muted tabular-nums">
            {t('myResult.position', { current: index + 1, total: items.length })}
          </p>
        </header>

        <div
          data-testid="result-banner"
          className={`flex items-center gap-3 rounded-xl border-2 p-3 ${style.banner}`}
        >
          <Icon aria-hidden className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-lg leading-tight font-bold">
              {t(`myResult.verdict.${item.verdict}`)}
            </p>
            {item.cluster && <p className="text-sm">{t('myResult.cluster', item.cluster)}</p>}
          </div>
          <p className="shrink-0 text-right font-semibold tabular-nums">
            {t('myResult.points', { score: fmt(item.score), points: fmt(item.points) })}
          </p>
        </div>

        <ItemBody item={item} />
        {extra?.(item)}

        <footer className="hidden items-center gap-2 lg:flex">
          <button
            type="button"
            disabled={prev === null}
            onClick={() => goTo(prev)}
            className={buttonClass('secondary', 'gap-1')}
          >
            <ChevronLeft aria-hidden className="size-5" />
            {t('myResult.prev')}
          </button>
          <button
            type="button"
            disabled={next === null}
            onClick={() => goTo(next)}
            className={buttonClass('primary', 'gap-1')}
          >
            {t('myResult.next')}
            <ChevronRight aria-hidden className="size-5" />
          </button>
          {wrongNext !== null && (
            <button
              type="button"
              onClick={() => goTo(wrongNext)}
              className={buttonClass('secondary', 'ml-auto')}
            >
              {t('myResult.nextWrong')}
            </button>
          )}
        </footer>
        {wrongNext !== null && (
          <button
            type="button"
            onClick={() => goTo(wrongNext)}
            className={buttonClass('secondary', 'lg:hidden')}
          >
            {t('myResult.nextWrong')}
          </button>
        )}
      </article>

      {/* Thanh dưới trên điện thoại, như màn làm bài: mở bản đồ, câu trước, câu sau. */}
      <nav
        aria-label={t('myResult.navLabel')}
        className="fixed inset-x-0 bottom-[var(--app-tabbar-h,0px)] z-40 border-t border-border bg-surface/95 p-2 backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={t('myResult.mapOpenLabel', { no: item.no })}
            onClick={() => setMapOpen(true)}
            className="inline-flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 text-left hover:bg-primary-soft"
          >
            <LayoutGrid aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold tabular-nums">
                {t('myResult.position', { current: index + 1, total: items.length })}
              </span>
              <span className="truncate text-[13px] text-fg-muted">
                {counts.wrong > 0
                  ? t('myResult.wrongSummary', { count: counts.wrong })
                  : t('myResult.noWrong')}
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label={t('myResult.prev')}
            disabled={prev === null}
            onClick={() => goTo(prev)}
            className={buttonClass('secondary', 'size-12 shrink-0 px-0')}
          >
            <ChevronLeft aria-hidden className="size-6" />
          </button>
          <button
            type="button"
            aria-label={t('myResult.next')}
            disabled={next === null}
            onClick={() => goTo(next)}
            className={buttonClass('primary', 'size-12 shrink-0 px-0')}
          >
            <ChevronRight aria-hidden className="size-6" />
          </button>
        </div>
      </nav>

      <Dialog open={mapOpen} onClose={() => setMapOpen(false)} title={t('myResult.mapTitle')}>
        <ResultMap
          items={items}
          current={item.no}
          filter={filter}
          onPick={goTo}
          marked={marked}
          large
        />
      </Dialog>
    </section>
  );
}

/** Bản đồ câu: ô có số, biểu tượng và màu theo kết quả; câu ngoài bộ lọc mờ đi (không ẩn, để vị trí không nhảy). */
function ResultMap({
  items,
  current,
  filter,
  onPick,
  marked,
  large = false,
}: {
  items: MyResultItem[];
  current: number;
  filter: ReviewVerdict | null;
  onPick: (index: number) => void;
  marked?: ReadonlySet<number>;
  /** Ô 48 px cho ngón tay (hộp thoại trên điện thoại); mặc định 40 px cho chuột. */
  large?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ul
      aria-label={t('myResult.mapTitle')}
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(var(--cell),1fr))] gap-2 p-0"
      style={{ '--cell': large ? '3rem' : '2.5rem' } as CSSProperties}
    >
      {items.map((entry, index) => {
        const style = STYLE[entry.verdict];
        const CellIcon = style.icon;
        return (
          <li key={entry.no} className="contents">
            <button
              type="button"
              aria-label={`${t('myResult.cell', {
                no: entry.no,
                verdict: t(`myResult.verdict.${entry.verdict}`),
              })}${marked?.has(entry.no) ? ` · ${t('appeal.marked')}` : ''}`}
              aria-current={entry.no === current ? 'true' : undefined}
              onClick={() => onPick(index)}
              className={`relative inline-flex ${large ? 'h-12' : 'h-10'} w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 text-sm font-semibold ${style.cell} ${
                entry.no === current ? 'ring-2 ring-ring ring-offset-2 ring-offset-bg' : ''
              } ${matchesFilter(entry, filter) ? '' : 'opacity-35'}`}
            >
              <span className="leading-none tabular-nums">{entry.no}</span>
              <CellIcon aria-hidden className="mt-0.5 size-3" />
              {marked?.has(entry.no) && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Nội dung câu: bài làm tự luận, nội dung và lựa chọn của chính họ khi được xem lại đề, hoặc lời giải thích ngắn. */
function ItemBody({ item }: { item: MyResultItem }) {
  const { t } = useTranslation();
  if (item.essay) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('myResult.yourAnswer')}</p>
        <p className="rounded-lg bg-bg p-3 break-words whitespace-pre-wrap">
          {item.essay.answer || t('grading.emptyAnswer')}
        </p>
        {item.essay.feedback && (
          <p className="rounded-lg bg-primary-soft p-3 text-on-primary-soft">
            <span className="font-medium">{t('myResult.feedback')}: </span>
            {item.essay.feedback}
          </p>
        )}
      </div>
    );
  }
  if (!item.review) {
    return <p className="text-sm text-fg-muted">{t('myResult.noReview')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <RichTextView doc={item.review.stem} />
      <ReadOnlyChoices item={item} />
    </div>
  );
}

type ChoiceDoc = { id: string; content: Parameters<typeof RichTextView>[0]['doc'] };

/** Phương án hay Mệnh đề giống màn làm bài nhưng không bấm được; chỉ đánh dấu những gì họ đã chọn. */
function ReadOnlyChoices({ item }: { item: MyResultItem }) {
  const { t } = useTranslation();
  const review = item.review;
  if (!review) return null;
  const answer = review.answer as {
    optionId?: string;
    optionIds?: string[];
    answers?: Record<string, boolean>;
  } | null;

  if (item.type === 'true_false_cluster') {
    const statements = (review.payload.statements ?? []) as ChoiceDoc[];
    return (
      <ul className="flex flex-col gap-3">
        {statements.map((statement, index) => {
          const said = answer?.answers?.[statement.id];
          return (
            <li
              key={statement.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 w-6 shrink-0 text-sm font-semibold">
                  {String.fromCharCode(97 + index)})
                </span>
                <RichTextView doc={statement.content} className="flex-1" />
              </div>
              <p
                className={`inline-flex w-fit items-center rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  said === undefined
                    ? 'bg-bg text-fg-muted'
                    : 'border border-primary bg-primary-soft text-on-primary-soft'
                }`}
              >
                {said === undefined
                  ? t('myResult.notAnswered')
                  : said
                    ? t('myResult.saidTrue')
                    : t('myResult.saidFalse')}
              </p>
            </li>
          );
        })}
      </ul>
    );
  }

  const options = (review.payload.options ?? []) as ChoiceDoc[];
  const chosen = new Set(answer?.optionId ? [answer.optionId] : (answer?.optionIds ?? []));
  const round = item.type === 'single_choice';
  return (
    <>
      <ul className="flex flex-col gap-2">
        {options.map((option, index) => {
          const mine = chosen.has(option.id);
          return (
            <li
              key={option.id}
              data-chosen={mine ? 'true' : undefined}
              className={`flex min-h-12 items-start gap-3 rounded-lg border p-3 ${
                mine ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center border text-xs font-semibold ${
                  round ? 'rounded-full' : 'rounded'
                } ${mine ? 'border-primary bg-primary text-on-primary' : 'border-border-strong'}`}
              >
                {LETTERS[index]}
              </span>
              <RichTextView doc={option.content} className="flex-1" />
              {mine && (
                <span className="shrink-0 text-xs font-semibold text-on-primary-soft">
                  {t('myResult.yourChoiceTag')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {chosen.size === 0 && <p className="text-sm text-fg-muted">{t('myResult.notAnswered')}</p>}
    </>
  );
}
