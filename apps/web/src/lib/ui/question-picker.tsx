import { EXAM_MAX_ITEMS, QUESTION_TYPES } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import type { PickedQuestion } from '../exam-draft';
import { questionsQuery, topicsQuery } from '../question-bank';
import { pageState, selectRange, togglePage, toggleQuestion } from '../question-selection';
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
  // Câu vừa tick gần nhất: mốc của Shift + tick. Giữ theo id nên đổi trang hay bộ lọc mà mốc không còn trên trang thì bỏ qua.
  const anchor = useRef<{ id: string; selected: boolean } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

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
  // Bản tóm tắt gọn của các câu trên trang hiện tại: chỉ phần cần để vẽ dòng trong Bộ đề, không giữ nội dung đầy đủ.
  const items = useMemo<PickedQuestion[]>(
    () =>
      (list.data?.items ?? []).map((item) => ({
        id: item.id,
        type: item.type,
        preview: item.preview,
        topicName: item.topicName,
        tags: item.tags,
        defaultPoints: item.defaultPoints,
        archived: false,
      })),
    [list.data],
  );
  const onPage = pageState(items, chosen, existing);

  // Ô "chọn tất cả" ở trạng thái một phần khi mới chọn vài câu của trang.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = onPage.state === 'some';
  }, [onPage.state]);

  // Tick một câu; giữ Shift thì chọn (hay bỏ chọn) cả dải từ câu tick trước đó tới câu này.
  const pick = (index: number, shift: boolean) => {
    const item = items[index];
    if (!item) return;
    const selected = !chosen.has(item.id);
    const from = shift && anchor.current ? items.findIndex((i) => i.id === anchor.current?.id) : -1;
    setChosen((prev) =>
      from >= 0
        ? selectRange(
            items,
            from,
            index,
            anchor.current?.selected ?? selected,
            prev,
            existing,
            room,
          )
        : toggleQuestion(prev, item, room),
    );
    // Câu vừa bấm thành mốc mới; dải tiếp theo cùng hướng (chọn hay bỏ chọn) với lần tick làm mốc.
    anchor.current = {
      id: item.id,
      selected: shift && from >= 0 ? (anchor.current?.selected ?? selected) : selected,
    };
  };

  const clear = () => {
    setChosen(new Map());
    anchor.current = null;
  };
  const close = () => {
    clear();
    onClose();
  };
  const add = () => {
    onAdd([...chosen.values()]);
    clear();
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
        {chosen.size >= room && room > 0 && (
          <p className="text-sm text-warning">{t('exam.picker.tooMany', { count: room })}</p>
        )}
        <ErrorMessage>{list.isError && errorMessage(t, list.error)}</ErrorMessage>

        {list.isPending ? (
          <ListSkeleton rows={4} />
        ) : list.data && list.data.items.length === 0 ? (
          <EmptyState>{t('exam.picker.none')}</EmptyState>
        ) : (
          <>
            {/* Chọn nhanh: cả trang, và số câu đã chọn (giữ qua các trang, đổi bộ lọc) */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={onPage.state === 'all'}
                  disabled={
                    onPage.selectable === 0 || (onPage.state === 'none' && room <= chosen.size)
                  }
                  onChange={() => setChosen((prev) => togglePage(items, prev, existing, room))}
                />
                <span className="text-sm font-medium">
                  {t('exam.picker.selectPage', { count: onPage.selectable })}
                </span>
              </label>
              <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
                {t('exam.picker.chosen', { count: chosen.size })}
                {chosen.size > 0 && (
                  <Button className="min-h-9 px-2 py-1 text-sm" onClick={clear}>
                    {t('exam.picker.clear')}
                  </Button>
                )}
              </p>
            </div>
            <p className="hidden text-xs text-fg-muted sm:block">{t('exam.picker.shiftHint')}</p>
            <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {(list.data?.items ?? []).map((item, index) => {
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
                        // Shift + tick chọn cả dải; onChange rỗng vì onClick mới biết phím Shift.
                        onClick={(e) => pick(index, e.shiftKey)}
                        onChange={() => undefined}
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
          </>
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
