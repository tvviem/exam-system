import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rememberTopic, searchTopics, suggestTopics, type TopicHit } from '../topic-search';
import type { TopicLike } from '../topic-tree';
import { fieldClass } from '.';

const RECENT_KEY = 'exam.recentTopics';

function readRecent(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Trình duyệt chặn bộ nhớ: chỉ mất danh sách dùng gần đây.
  }
}

/** Tên Chủ đề với các đoạn khớp từ khóa được tô đậm. */
function Marked({ name, marks }: { name: string; marks: [number, number][] }) {
  const parts = [];
  let at = 0;
  for (const [from, to] of marks) {
    if (from < at) continue;
    parts.push(name.slice(at, from), <b key={from}>{name.slice(from, to)}</b>);
    at = to;
  }
  parts.push(name.slice(at));
  return <>{parts}</>;
}

interface Section<T> {
  key: string;
  heading?: string;
  options: (TopicHit<T> | null)[];
}

/**
 * Ô chọn một Chủ đề, gõ để tìm (docs/plan/hop-chon-cau-thiet-ke.md mục 3): chưa gõ chỉ hiện vài Chủ đề, gõ thì tìm không
 * dấu và theo chữ cái đầu. Bàn phím: mũi tên, Enter, Esc chỉ đóng danh sách. `value` rỗng là "mọi Chủ đề".
 */
export function TopicCombobox<T extends TopicLike>({
  label,
  allLabel,
  topics,
  value,
  onChange,
}: {
  label: string;
  /** Chữ của lựa chọn không lọc theo Chủ đề. */
  allLabel: string;
  topics: readonly T[];
  value: string;
  onChange: (topicId: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const inputRef = useRef<HTMLInputElement>(null);

  const searching = query.trim() !== '';
  const found = searching ? searchTopics(topics, query) : null;
  const suggested = searching ? null : suggestTopics(topics, recent);
  const plain = (topic: T): TopicHit<T> => ({ topic, marks: [] });
  // `null` là lựa chọn "mọi Chủ đề".
  const sections: Section<T>[] = found
    ? [{ key: 'found', options: found.hits }]
    : [
        { key: 'all', options: [null] },
        {
          key: 'recent',
          heading: t('topicPicker.recent'),
          options: (suggested?.recent ?? []).map(plain),
        },
        {
          key: 'name',
          heading: suggested?.recent.length ? t('topicPicker.byName') : undefined,
          options: (suggested?.others ?? []).map(plain),
        },
      ].filter((section) => section.options.length > 0);
  const flat = sections.flatMap((section) => section.options);
  const optionId = (index: number) => `${id}-option-${index}`;

  const note = found
    ? found.total === 0
      ? t('topicPicker.none')
      : found.total > found.hits.length
        ? t('topicPicker.moreResults', { count: found.total - found.hits.length })
        : null
    : suggested?.hidden
      ? t('topicPicker.more', { count: suggested.hidden })
      : null;

  const show = () => {
    setActive(0);
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (topicId: string) => {
    if (topicId) {
      const next = rememberTopic(recent, topicId);
      setRecent(next);
      saveRecent(next);
    }
    hide();
    onChange(topicId);
  };
  const move = (step: number) => {
    if (!open) return show();
    if (flat.length === 0) return;
    const next = (active + step + flat.length) % flat.length;
    setActive(next);
    document.getElementById(optionId(next))?.scrollIntoView({ block: 'nearest' });
  };

  const selectedName = topics.find((topic) => topic.id === value)?.name ?? allLabel;
  let index = 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && flat.length > 0 ? optionId(active) : undefined}
          autoComplete="off"
          className={fieldClass}
          placeholder={t('topicPicker.placeholder')}
          title={selectedName}
          value={open ? query : selectedName}
          onFocus={(e) => e.target.select()}
          onBlur={hide}
          onClick={() => !open && show()}
          onChange={(e) => {
            // Đang đóng thì chữ trong ô là tên đang chọn: ký tự gõ thêm mới là từ khóa.
            const typed = e.target.value;
            setQuery(
              !open && typed.startsWith(selectedName) ? typed.slice(selectedName.length) : typed,
            );
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(e.key === 'ArrowDown' ? 1 : -1);
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              const hit = flat[active];
              if (hit !== undefined) choose(hit?.topic.id ?? '');
            } else if (e.key === 'Escape' && open) {
              // Chặn mặc định để hộp thoại chứa ô này không đóng theo.
              e.preventDefault();
              hide();
            }
          }}
        />
        {open && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border-strong bg-surface-raised p-1 shadow-lg">
            <div
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={label}
              className="max-h-[min(24rem,50dvh)] overflow-y-auto overscroll-contain"
              // Giữ con trỏ ở ô nhập khi bấm một lựa chọn hay kéo thanh cuộn, nếu không danh sách đóng trước.
              onMouseDown={(e) => e.preventDefault()}
            >
              {sections.map((section) => (
                // biome-ignore lint/a11y/useSemanticElements: nhóm lựa chọn trong listbox, không phải nhóm ô nhập
                <div
                  key={section.key}
                  role="group"
                  aria-labelledby={section.heading ? `${id}-${section.key}` : undefined}
                >
                  {section.heading && (
                    <p
                      id={`${id}-${section.key}`}
                      className="px-2 pt-2 pb-1 text-xs font-semibold text-fg-muted uppercase"
                    >
                      {section.heading}
                    </p>
                  )}
                  {section.options.map((hit) => {
                    const at = index++;
                    const count = hit?.topic.questionCount ?? 0;
                    return (
                      <button
                        key={hit?.topic.id ?? 'all'}
                        id={optionId(at)}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={at === active}
                        aria-label={
                          hit ? t('topicPicker.option', { name: hit.topic.name, count }) : allLabel
                        }
                        className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm pointer-fine:min-h-9 ${
                          at === active ? 'bg-primary-soft text-on-primary-soft' : ''
                        }`}
                        onMouseMove={() => setActive(at)}
                        onClick={() => {
                          choose(hit?.topic.id ?? '');
                          // Màn cảm ứng: rời ô để bàn phím ảo không che phần còn lại của hộp.
                          if (matchMedia('(pointer: coarse)').matches) inputRef.current?.blur();
                        }}
                      >
                        <span className="min-w-0 break-words">
                          {hit ? <Marked name={hit.topic.name} marks={hit.marks} /> : allLabel}
                        </span>
                        {hit && (
                          <span className="shrink-0 text-fg-muted tabular-nums">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {note && <p className="px-2 py-2 text-sm text-fg-muted">{note}</p>}
          </div>
        )}
        <span role="status" className="sr-only">
          {open && found ? t('topicPicker.matches', { count: found.total }) : ''}
        </span>
      </div>
    </div>
  );
}
