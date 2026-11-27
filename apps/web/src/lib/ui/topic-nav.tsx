import { ChevronDown, ChevronRight } from 'lucide-react';
import { type KeyboardEvent, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Topic } from '../question-bank';
import { filterTopicTree, flattenTopicTree, groupTopics } from '../topic-tree';
import { SearchField } from '.';

// Danh sách Chủ đề để lọc Ngân hàng câu hỏi (docs/plan/chu-de-ux-thiet-ke.md mục 4.2): cột bên trái ở máy tính, hộp
// "Chọn Chủ đề" ở điện thoại. Gom nhóm theo phần đầu tên, tìm nhiều từ không dấu.

/** Từ chừng này Chủ đề thì hiện ô tìm. */
const SEARCH_FROM = 9;
/** Tới chừng này Chủ đề thì các nhóm mở sẵn. */
const OPEN_UP_TO = 20;
const REMEMBER_KEY = 'exam.topicGroups';

function remembered(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function remember(key: string, open: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ ...remembered(), [key]: open }));
  } catch {
    // Trình duyệt không cho lưu: chỉ mất việc nhớ nhóm đang mở.
  }
}

function Row({
  active,
  count,
  name,
  label = name,
  onClick,
}: {
  active: boolean;
  count: number;
  /** Tên đầy đủ. */
  name: string;
  /** Chữ hiện ở dòng (phần còn lại sau tên nhóm). */
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={name}
      aria-label={label === name ? undefined : `${name} ${count}`}
      onClick={onClick}
      // `shrink-0`: trong khung cuộn, dòng không được co thấp hơn chữ của nó (chữ sẽ đè lên dòng khác).
      className={`flex min-h-12 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-medium pointer-fine:min-h-9 ${
        active ? 'bg-primary-soft text-on-primary-soft' : 'text-fg hover:bg-primary-soft'
      }`}
    >
      <span className="min-w-0 break-words">{label}</span>
      <span
        className={`shrink-0 tabular-nums ${count === 0 ? 'text-fg-muted/70' : 'text-fg-muted'}`}
      >
        {count}
      </span>
    </button>
  );
}

export function TopicNav({
  topics,
  selectedId,
  onSelect,
  scroll = false,
}: {
  topics: Topic[];
  selectedId: string | undefined;
  onSelect: (topicId: string | undefined) => void;
  /** Cột bên trái: danh sách tự cuộn, "Tất cả" và ô tìm đứng yên. Trong hộp thoại thì hộp thoại cuộn. */
  scroll?: boolean;
}) {
  const { t } = useTranslation();
  // Cột bên trái và hộp thoại cùng có mặt trong trang: mỗi nơi cần id ô tìm riêng.
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [saved] = useState(remembered);
  const tree = useMemo(() => groupTopics(topics), [topics]);
  const searching = query.trim() !== '';
  const shown = useMemo(() => filterTopicTree(tree, query), [tree, query]);
  const matches = flattenTopicTree(shown);
  const total = topics.reduce((sum, topic) => sum + (topic.questionCount ?? 0), 0);

  const isOpen = (key: string, hasSelected: boolean) =>
    searching || (toggled[key] ?? (hasSelected || (saved[key] ?? topics.length <= OPEN_UP_TO)));
  const toggle = (key: string, open: boolean) => {
    setToggled((prev) => ({ ...prev, [key]: open }));
    remember(key, open);
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!searching) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (matches[0]) onSelect(matches[0].id);
    }
    if (event.key === 'Escape') {
      // Xóa từ khóa, không đóng hộp thoại đang chứa ô tìm.
      event.preventDefault();
      setQuery('');
    }
  };

  const row = (topic: Topic, label?: string) => (
    <Row
      key={topic.id}
      active={selectedId === topic.id}
      count={topic.questionCount ?? 0}
      name={topic.name}
      label={label}
      onClick={() => onSelect(topic.id)}
    />
  );

  return (
    <div data-testid="topic-nav" className="flex min-h-0 flex-col gap-1">
      <Row
        active={!selectedId}
        count={total}
        name={t('questionBank.allTopics')}
        onClick={() => onSelect(undefined)}
      />
      {topics.length >= SEARCH_FROM && (
        <div className="px-1 pb-1">
          <SearchField
            id={searchId}
            label={t('questionBank.searchTopics')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
        </div>
      )}
      {searching && matches.length > 0 && (
        <p role="status" className="px-2 text-sm text-fg-muted">
          {t('questionBank.topicMatches', { count: matches.length })}
        </p>
      )}
      <div
        data-testid="topic-list"
        className={`flex flex-col gap-1 ${
          scroll ? 'max-h-[calc(100dvh-var(--app-header-h)-14rem)] min-h-48 overflow-y-auto' : ''
        }`}
      >
        {shown.groups.map((group) => {
          const open = isOpen(
            group.key,
            group.items.some((item) => item.topic.id === selectedId),
          );
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <div key={group.key} className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.key, !open)}
                className="flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-sm font-semibold text-fg hover:bg-primary-soft pointer-fine:min-h-9"
              >
                <Chevron aria-hidden className="size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 break-words">
                  {group.name}{' '}
                  <span className="sr-only">
                    {t('questionBank.topicGroupSize', { count: group.items.length })}
                  </span>
                </span>
                <span className="shrink-0 pr-1.5 text-fg-muted tabular-nums">
                  {group.questionCount}
                </span>
              </button>
              {open && (
                <div className="ml-3 flex flex-col gap-1 border-l border-border pl-1">
                  {group.items.map((item) => row(item.topic, item.label))}
                </div>
              )}
            </div>
          );
        })}
        {shown.singles.map((topic) => row(topic))}
        {searching && matches.length === 0 && (
          <div className="px-2 py-2 text-sm text-fg-muted">
            <p>{t('questionBank.noTopicMatch', { q: query.trim() })}</p>
            <p>{t('questionBank.noTopicMatchHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
