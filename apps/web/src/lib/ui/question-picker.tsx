import { EXAM_MAX_ITEMS, QUESTION_TYPES } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import type { PickedQuestion } from '../exam-draft';
import { questionsQuery, topicsQuery } from '../question-bank';
import { Button, Dialog, ErrorMessage, SearchField, SelectField, TextField } from '.';
import { EmptyState, ListSkeleton, Pagination } from './admin';

/**
 * Chọn Câu hỏi từ ngân hàng để thêm vào một Phần của Bộ đề (Q186): dùng cùng bộ lọc với danh sách Câu hỏi, tick nhiều
 * (giữ lựa chọn qua các trang), câu đã có trong Bộ đề hiện "Đã có" và không tick được.
 */
export function QuestionPicker({
  open,
  sectionName,
  existing,
  onClose,
  onAdd,
}: {
  open: boolean;
  sectionName: string;
  /** Id các câu đã có trong Bộ đề. */
  existing: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (picked: PickedQuestion[]) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [topicId, setTopicId] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Map<string, PickedQuestion>>(new Map());

  // Chờ gõ xong một nhịp rồi mới hỏi api.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const topics = useQuery({ ...topicsQuery(), enabled: open });
  const list = useQuery({
    ...questionsQuery({
      q: q || undefined,
      topicId: topicId || undefined,
      tag: tag.trim() || undefined,
      type: (type || undefined) as (typeof QUESTION_TYPES)[number] | undefined,
      page,
    }),
    enabled: open,
  });

  const room = EXAM_MAX_ITEMS - existing.size;
  const toggle = (item: NonNullable<typeof list.data>['items'][number]) =>
    setChosen((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < room) {
        next.set(item.id, {
          id: item.id,
          type: item.type,
          preview: item.preview,
          topicName: item.topicName,
          tags: item.tags,
          defaultPoints: item.defaultPoints,
          archived: false,
        });
      }
      return next;
    });

  const close = () => {
    setChosen(new Map());
    onClose();
  };
  const add = () => {
    onAdd([...chosen.values()]);
    setChosen(new Map());
  };

  return (
    <Dialog open={open} onClose={close} title={t('exam.picker.title')} size="xl">
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchField
            id="picker-search"
            label={t('exam.picker.search')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
          />
          <SelectField
            id="picker-topic"
            label={t('exam.picker.topic')}
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('exam.picker.allTopics')}</option>
            {topics.data?.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="picker-type"
            label={t('exam.picker.type')}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('exam.picker.allTypes')}</option>
            {QUESTION_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`questionType.${value}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            id="picker-tag"
            label={t('exam.picker.tag')}
            value={tag}
            maxLength={100}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {room <= 0 && <p className="text-sm text-warning">{t('exam.picker.full')}</p>}
        <ErrorMessage>{list.isError && errorMessage(t, list.error)}</ErrorMessage>

        {list.isPending ? (
          <ListSkeleton rows={4} />
        ) : list.data && list.data.items.length === 0 ? (
          <EmptyState>{t('exam.picker.none')}</EmptyState>
        ) : (
          <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {list.data?.items.map((item) => {
              const already = existing.has(item.id);
              const checked = chosen.has(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={`flex min-h-12 items-start gap-3 rounded-lg border p-3 ${
                      already
                        ? 'border-border bg-bg opacity-70'
                        : checked
                          ? 'cursor-pointer border-primary bg-primary-soft'
                          : 'cursor-pointer border-border bg-surface hover:bg-primary-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0"
                      checked={already || checked}
                      disabled={already || (!checked && chosen.size >= room)}
                      aria-label={t('exam.picker.selectQuestion', { preview: item.preview })}
                      onChange={() => toggle(item)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="line-clamp-2 break-words">{item.preview}</span>
                      <span className="text-sm text-fg-muted">
                        {t(`questionType.${item.type}`)} · {item.topicName} ·{' '}
                        {t('questionBank.points', { points: item.defaultPoints })}
                        {already && ` · ${t('exam.picker.already')}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {list.data && (
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={chosen.size === 0} onClick={add}>
            {chosen.size === 0
              ? t('exam.picker.addNone')
              : t('exam.picker.add', { count: chosen.size, section: sectionName })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
