import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { plainTextOf, type TakeItem } from '../take';
import { RichTextView } from './rich-text-view';

// Một câu hỏi ở khu làm bài (Q240): cả dòng Phương án bấm được, vùng chạm ≥ 48 px, không bao giờ hiện Đáp án.

const LETTERS = 'ABCDEFGH';

const rowClass =
  'relative flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-ring';

/** Ô chọn phủ kín cả dòng, trong suốt: chạm chỗ nào trên dòng cũng chọn, trình đọc màn hình vẫn thấy ô chọn thật. */
const hiddenInput = 'absolute inset-0 size-full cursor-pointer opacity-0';

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export interface QuestionHandlers {
  onValue: (itemId: string, value: unknown, kind?: 'choice' | 'text') => void;
  onFlag: (itemId: string, flagged: boolean) => void;
  /** Rời ô tự luận: gửi ngay phần đang chờ. */
  onBlurText: () => void;
}

export function TakeQuestion({
  item,
  value,
  flagged,
  handlers,
}: {
  item: TakeItem;
  value: unknown;
  flagged: boolean;
  handlers: QuestionHandlers;
}) {
  const { t } = useTranslation();
  return (
    <article
      id={`item-${item.itemId}`}
      aria-labelledby={`item-${item.itemId}-title`}
      className="flex scroll-mt-24 flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 id={`item-${item.itemId}-title`} className="font-sans text-base font-semibold">
          {t('take.question', { no: item.no })}
          <span className="ml-2 text-sm font-normal text-fg-muted">
            {t('take.points', { count: item.points })}
          </span>
        </h2>
        <button
          type="button"
          aria-pressed={flagged}
          onClick={() => handlers.onFlag(item.itemId, !flagged)}
          className={`inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 font-sans text-sm font-medium ${
            flagged
              ? 'bg-warning-soft text-warning'
              : 'text-fg-muted hover:bg-primary-soft hover:text-fg'
          }`}
        >
          <Flag aria-hidden className="size-5" fill={flagged ? 'currentColor' : 'none'} />
          {t('take.flag')}
        </button>
      </header>
      <RichTextView doc={item.stem} />
      <Controls item={item} value={value} handlers={handlers} />
    </article>
  );
}

function Controls({
  item,
  value,
  handlers,
}: {
  item: TakeItem;
  value: unknown;
  handlers: QuestionHandlers;
}) {
  const { t } = useTranslation();
  const current = asRecord(value);

  if (item.type === 'single_choice') {
    const chosen = typeof current.optionId === 'string' ? current.optionId : null;
    return (
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label={t('take.options')} className="flex flex-col gap-2">
          {(item.payload.options ?? []).map((option, index) => (
            <label key={option.id} className={rowClass}>
              <input
                type="radio"
                name={item.itemId}
                checked={chosen === option.id}
                onChange={() => handlers.onValue(item.itemId, { optionId: option.id })}
                className={hiddenInput}
              />
              <Letter index={index} round />
              <RichTextView doc={option.content} className="flex-1" />
            </label>
          ))}
        </div>
        {chosen !== null && (
          <button
            type="button"
            onClick={() => handlers.onValue(item.itemId, null)}
            className="min-h-12 cursor-pointer self-start rounded-lg px-3 font-sans text-sm font-medium text-primary hover:bg-primary-soft"
          >
            {t('take.clearChoice')}
          </button>
        )}
      </div>
    );
  }

  if (item.type === 'multiple_choice') {
    const chosen = Array.isArray(current.optionIds) ? (current.optionIds as string[]) : [];
    const options = item.payload.options ?? [];
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 font-sans text-sm text-fg-muted">{t('take.chooseMany')}</legend>
        {options.map((option, index) => (
          <label key={option.id} className={rowClass}>
            <input
              type="checkbox"
              checked={chosen.includes(option.id)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...chosen, option.id]
                  : chosen.filter((id) => id !== option.id);
                // Giữ đúng thứ tự Phương án đang hiện, để cùng một lựa chọn luôn lưu cùng một giá trị.
                handlers.onValue(item.itemId, {
                  optionIds: options.map((o) => o.id).filter((id) => next.includes(id)),
                });
              }}
              className={hiddenInput}
            />
            <Letter index={index} />
            <RichTextView doc={option.content} className="flex-1" />
          </label>
        ))}
      </fieldset>
    );
  }

  if (item.type === 'true_false_cluster') {
    const answers = asRecord(current.answers) as Record<string, boolean>;
    return (
      <div className="flex flex-col gap-3">
        {(item.payload.statements ?? []).map((statement, index) => (
          <fieldset
            key={statement.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <legend className="sr-only">{plainTextOf(statement.content)}</legend>
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 w-6 shrink-0 font-sans text-sm font-semibold">
                {String.fromCharCode(97 + index)})
              </span>
              <RichTextView doc={statement.content} className="flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((answer) => (
                <label
                  key={String(answer)}
                  className={`${rowClass} items-center justify-center font-sans font-semibold`}
                >
                  <input
                    type="radio"
                    name={`${item.itemId}-${statement.id}`}
                    aria-label={`${answer ? t('take.true') : t('take.false')}: ${plainTextOf(statement.content)}`}
                    checked={answers[statement.id] === answer}
                    onChange={() =>
                      handlers.onValue(item.itemId, {
                        answers: { ...answers, [statement.id]: answer },
                      })
                    }
                    className={hiddenInput}
                  />
                  {answer ? t('take.true') : t('take.false')}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    );
  }

  const text = typeof current.text === 'string' ? current.text : '';
  const max = item.payload.maxLength ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <textarea
        aria-label={t('take.essayLabel')}
        aria-describedby={max > 0 ? `${item.itemId}-count` : undefined}
        value={text}
        maxLength={max || undefined}
        rows={8}
        onChange={(event) => handlers.onValue(item.itemId, { text: event.target.value }, 'text')}
        onBlur={handlers.onBlurText}
        className="min-h-48 w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
      />
      {max > 0 && (
        <p id={`${item.itemId}-count`} className="self-end font-sans text-sm text-fg-muted">
          {t('take.essayCount', { count: text.length, max })}
        </p>
      )}
    </div>
  );
}

function Letter({ index, round = false }: { index: number; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center border border-border-strong font-sans text-xs font-semibold ${
        round ? 'rounded-full' : 'rounded'
      }`}
    >
      {LETTERS[index]}
    </span>
  );
}
