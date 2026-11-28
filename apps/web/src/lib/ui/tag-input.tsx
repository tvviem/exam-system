import { normalizeTag } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { questionTagsQuery } from '../question-bank';
import { splitTagText, suggestTags, type TagOption } from '../tag-suggest';

const union = (tags: string[], more: string[]) => [...new Set([...tags, ...more])];

/**
 * Ô nhập tag của một Câu hỏi: tag đã gắn thành nhãn, đang gõ thì gợi ý tag đang có (docs/plan/loc-nhieu-tag-thiet-ke.md
 * mục 4). Enter chọn lựa chọn đang tô; dấu phẩy hay rời ô thì thêm đúng chữ đã gõ. `onChange` gồm cả chữ đang gõ dở, nên
 * bấm Lưu ngay không mất tag.
 */
export function TagInput({
  label,
  initial,
  topicId,
  onChange,
  hint,
  error,
  inline = false,
}: {
  label: string;
  /** Tag lúc dựng ô; muốn nạp lại thì dựng ô mới (đổi `key`). */
  initial: string[];
  /** Chủ đề của câu: tag của Chủ đề này được gợi ý trước. */
  topicId: string;
  onChange: (tags: string[]) => void;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Trong hộp thoại: gợi ý nằm trong dòng chảy (không bị khung hộp cắt) và không đổi gì khi rời ô, để nút bên dưới không
   * nhảy chỗ ngay lúc đang bấm (chữ đang gõ vốn đã nằm trong `onChange`).
   */
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const [tags, setTags] = useState(initial);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Chỉ tải khi người dùng vào ô.
  const [used, setUsed] = useState(false);
  const all = useQuery({ ...questionTagsQuery({}), enabled: used });
  const inTopic = useQuery({ ...questionTagsQuery({ topicId }), enabled: used && !!topicId });

  const options = open
    ? suggestTags(all.data ?? [], new Set(inTopic.data?.map((row) => row.tag)), tags, text)
    : [];
  const shown = options.length > 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  const apply = (next: string[], rest: string) => {
    setTags(next);
    setText(rest);
    setActive(0);
    const pending = normalizeTag(rest);
    onChange(pending ? union(next, [pending]) : next);
  };
  const add = (more: string[], rest = '') => apply(union(tags, more), rest);
  const commit = () => {
    const pending = normalizeTag(text);
    if (pending) add([pending]);
  };
  const choose = (option: TagOption) => {
    add([option.tag]);
    // Trong hộp thoại danh sách nằm trong dòng chảy: chọn xong thì gập lại, chừa chỗ cho phần bên dưới.
    if (inline) setOpen(false);
  };
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].join(' ').trim();

  return (
    <div
      data-tag-field
      className="flex min-w-0 scroll-mt-[calc(var(--app-header-h)+0.5rem)] flex-col gap-1"
    >
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <div
          data-testid="tag-input"
          className={`flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40 ${
            error ? 'border-danger' : 'border-border-strong'
          }`}
        >
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-w-0 items-center gap-1 rounded-full bg-primary-soft pl-3 text-sm font-medium text-on-primary-soft wrap-anywhere"
            >
              {tag}
              <button
                type="button"
                aria-label={t('tagInput.remove', { tag })}
                className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-primary/10 pointer-fine:size-8"
                onClick={() =>
                  apply(
                    tags.filter((other) => other !== tag),
                    text,
                  )
                }
              >
                <X aria-hidden className="size-4" />
              </button>
            </span>
          ))}
          <input
            id={id}
            role="combobox"
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown ? optionId(active) : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            autoComplete="off"
            autoCapitalize="none"
            className="h-12 min-w-32 flex-1 bg-transparent px-2 text-base text-fg outline-none pointer-fine:h-8"
            value={text}
            onFocus={(e) => {
              setUsed(true);
              // Màn cảm ứng: đưa ô lên sát đầu trang để gợi ý không nằm dưới bàn phím ảo và các thanh ở đáy.
              if (matchMedia('(pointer: coarse)').matches) {
                e.currentTarget.closest('[data-tag-field]')?.scrollIntoView({ block: 'start' });
              }
            }}
            onClick={() => setOpen(true)}
            onBlur={
              inline
                ? undefined
                : () => {
                    setOpen(false);
                    commit();
                  }
            }
            onChange={(e) => {
              const { done, rest } = splitTagText(e.target.value);
              setOpen(true);
              if (done.length > 0) add(done, rest);
              else apply(tags, rest);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!shown) return setOpen(true);
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((active + step + options.length) % options.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const option = options[active];
                if (option) choose(option);
                else commit();
              } else if (e.key === 'Escape' && shown) {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
                e.preventDefault();
                apply(tags.slice(0, -1), '');
              }
            }}
          />
        </div>
        {shown && (
          <div
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={t('tagInput.suggestions')}
            className={`mt-1 max-h-[min(20rem,45dvh)] overflow-y-auto rounded-lg border border-border-strong bg-surface-raised p-1 ${
              inline ? '' : 'absolute inset-x-0 top-full z-20 shadow-lg'
            }`}
            // Giữ con trỏ ở ô nhập khi bấm một gợi ý, nếu không chữ đang gõ được thêm trước.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((option, index) => (
              <button
                key={`${option.kind} ${option.tag}`}
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                aria-label={
                  option.kind === 'new'
                    ? t('tagInput.create', { tag: option.tag })
                    : t('tagFilter.option', { tag: option.tag, count: option.count })
                }
                className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 text-left text-sm pointer-fine:min-h-9 ${
                  index === active ? 'bg-primary-soft text-on-primary-soft' : ''
                }`}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span className="min-w-0 wrap-anywhere">
                  {option.kind === 'new' ? t('tagInput.create', { tag: option.tag }) : option.tag}
                </span>
                {option.kind === 'existing' && (
                  <span className="shrink-0 text-fg-muted tabular-nums">{option.count}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
