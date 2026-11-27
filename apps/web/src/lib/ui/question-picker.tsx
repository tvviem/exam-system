import { EXAM_MAX_ITEMS, QUESTION_TYPES } from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Eye, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import type { PickedQuestion } from '../exam-draft';
import { questionsQuery, topicsQuery } from '../question-bank';
import { pageState, selectRange, togglePage, toggleQuestion } from '../question-selection';
import { useMediaQuery, WIDE_SCREEN } from '../use-media-query';
import { Button, Dialog, ErrorMessage, fieldClass, SearchField, SelectField, TextField } from '.';
import { EmptyState, FilterChip, ListSkeleton, Pagination } from './admin';
import { QuestionDetailDialog } from './question-detail-dialog';
import { TopicCombobox } from './topic-combobox';

/**
 * Chọn Câu hỏi từ ngân hàng để thêm vào một Phần của Bộ đề (Q186): dùng cùng bộ lọc với danh sách Câu hỏi, tick nhiều
 * (giữ lựa chọn qua các trang), câu đã có trong Bộ đề hiện "Đã có" và không tick được. Luôn nói rõ đang thêm vào Phần nào
 * (đổi Phần được ngay trong hộp, lựa chọn giữ nguyên); nút chính luôn ngắn dù tên Phần dài.
 *
 * Bố cục (docs/plan/hop-chon-cau-thiet-ke.md mục 2): đầu và chân đứng yên; màn rộng có cột lọc bên trái và danh sách bên
 * phải; màn hẹp toàn màn hình, bộ lọc là một màn riêng trong cùng hộp.
 */
export function QuestionPicker({
  open,
  sections,
  sectionKey,
  onSectionChange,
  existing,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** Các Phần của Bộ đề, theo thứ tự, kèm số câu hiện có. */
  sections: { key: string; name: string; count: number }[];
  /** Phần đang được thêm câu vào. */
  sectionKey: string | null;
  onSectionChange: (key: string) => void;
  /** Id các câu đã có trong Bộ đề. */
  existing: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (picked: PickedQuestion[]) => void;
}) {
  const { t } = useTranslation();
  const sectionName = sections.find((s) => s.key === sectionKey)?.name ?? '';
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [topicId, setTopicId] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Map<string, PickedQuestion>>(new Map());
  // Câu đang xem ở "Chi tiết câu hỏi" (mở từ nút Xem của dòng); đóng hộp chính thì đóng luôn.
  const [detailId, setDetailId] = useState<string | null>(null);
  // Màn hẹp: đang ở màn "Bộ lọc" thay cho danh sách. Màn rộng luôn thấy cả hai.
  const [filtering, setFiltering] = useState(false);
  const wide = useMediaQuery(WIDE_SCREEN);
  const listRef = useRef<HTMLDivElement>(null);
  // Câu vừa tick gần nhất: mốc của Shift + tick. Giữ theo id nên đổi trang hay bộ lọc mà mốc không còn trên trang thì bỏ qua.
  const anchor = useRef<{ id: string; selected: boolean } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Đổi trang hay bộ lọc: danh sách khác nên câu mốc của Shift + tick không còn nghĩa, và xem lại từ đầu danh sách.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ để đặt lại khi các giá trị này đổi
  useEffect(() => {
    anchor.current = null;
    listRef.current?.scrollTo(0, 0);
  }, [page, q, topicId, type, tag]);

  // Chờ gõ xong một nhịp rồi mới hỏi api. Chỉ đặt lại trang khi từ khóa thật sự đổi: nếu không, bộ đếm chạy ngay từ lúc màn
  // Bộ đề được dựng và kéo người dùng về trang 1 giữa chừng khi họ vừa sang trang 2.
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = setTimeout(() => {
      setQ(next);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text, q]);

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
    setDetailId(null);
    setFiltering(false);
    onClose();
  };
  // Chọn hay bỏ chọn một câu từ hộp chi tiết, cùng cách với tick ở danh sách (và làm mốc cho Shift + tick).
  const toggleFromDetail = (item: PickedQuestion) => {
    const selected = !chosen.has(item.id);
    setChosen((prev) => toggleQuestion(prev, item, room));
    anchor.current = { id: item.id, selected };
  };
  const detailItem = items.find((item) => item.id === detailId) ?? null;
  const add = () => {
    onAdd([...chosen.values()]);
    clear();
    setFiltering(false);
  };

  // Đổi một bộ lọc thì về trang đầu.
  const filter = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };
  const pickTopic = filter(setTopicId);
  const pickType = filter(setType);
  const pickTag = filter(setTag);
  const topicName = topics.data?.find((topic) => topic.id === topicId)?.name;
  const chips = [
    topicId && { key: 'topic', label: topicName ?? '', clear: () => pickTopic('') },
    type && {
      key: 'type',
      label: t(`questionType.${type as (typeof QUESTION_TYPES)[number]}`),
      clear: () => pickType(''),
    },
    tag.trim() && {
      key: 'tag',
      label: t('exam.picker.tagFilter', { tag: tag.trim() }),
      clear: () => pickTag(''),
    },
  ].filter((chip) => !!chip);
  const resetFilters = () => {
    for (const chip of chips) chip.clear();
  };

  const sectionSelect = sections.length > 1 && (
    <select
      id="picker-section"
      className={`${fieldClass} min-w-0 lg:w-72`}
      value={sectionKey ?? ''}
      title={sectionName}
      onChange={(e) => onSectionChange(e.target.value)}
    >
      {sections.map((s) => (
        <option key={s.key} value={s.key}>
          {t('exam.picker.sectionOption', { name: s.name, count: s.count })}
        </option>
      ))}
    </select>
  );
  const destination = (
    <p
      className="min-w-0 text-sm text-fg-muted"
      data-testid="picker-destination"
      title={sectionName}
    >
      {t('exam.picker.willAdd')}{' '}
      <span className="font-medium text-fg wrap-anywhere">{sectionName}</span>
    </p>
  );

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        onEscape={filtering && !wide ? () => setFiltering(false) : undefined}
        title={t('exam.picker.title')}
        size="screen"
        headerExtra={
          wide &&
          sectionSelect && (
            <div className="flex items-center gap-2">
              <label htmlFor="picker-section" className="shrink-0 text-sm text-fg-muted">
                {t('exam.picker.into')}
              </label>
              {sectionSelect}
            </div>
          )
        }
      >
        <div className="flex min-h-0 flex-1">
          <div
            data-testid="picker-filters"
            className={`${filtering ? 'flex' : 'hidden'} w-full flex-col gap-4 overflow-y-auto p-4 lg:flex lg:w-75 lg:shrink-0 lg:border-r lg:border-border lg:bg-surface`}
          >
            <Button className="self-start lg:hidden" onClick={() => setFiltering(false)}>
              <ChevronLeft aria-hidden className="size-5" />
              {t('exam.picker.backToList')}
            </Button>
            <TopicCombobox
              label={t('exam.picker.topic')}
              allLabel={t('exam.picker.allTopics')}
              topics={topics.data ?? []}
              value={topicId}
              onChange={pickTopic}
            />
            <SelectField
              id="picker-type"
              label={t('exam.picker.type')}
              value={type}
              onChange={(e) => pickType(e.target.value)}
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
              onChange={(e) => pickTag(e.target.value)}
            />
          </div>

          <div
            className={`${filtering ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 flex-col gap-2 px-4 pt-3 lg:px-5`}
          >
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <SearchField
                  id="picker-search"
                  label={t('exam.picker.search')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={200}
                />
              </div>
              <Button className="shrink-0 lg:hidden" onClick={() => setFiltering(true)}>
                <SlidersHorizontal aria-hidden className="size-5" />
                {chips.length > 0
                  ? t('exam.picker.filtersActive', { count: chips.length })
                  : t('exam.picker.filters')}
              </Button>
            </div>

            {chips.length > 0 && (
              <ul aria-label={t('exam.picker.activeFilters')} className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li key={chip.key} className="min-w-0 wrap-anywhere">
                    <FilterChip label={chip.label} onClear={chip.clear} />
                  </li>
                ))}
              </ul>
            )}

            {room <= 0 && <p className="text-sm text-warning">{t('exam.picker.full')}</p>}
            {chosen.size >= room && room > 0 && (
              <p className="text-sm text-warning">{t('exam.picker.tooMany', { count: room })}</p>
            )}
            <ErrorMessage>{list.isError && errorMessage(t, list.error)}</ErrorMessage>

            {/* Chọn nhanh cả trang và lật trang, một dòng trên đầu danh sách */}
            {items.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <label className="flex min-h-12 cursor-pointer select-none items-center gap-3 lg:pl-2 pointer-fine:min-h-9">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="size-5 shrink-0"
                    aria-label={t('exam.picker.selectPage', { count: onPage.selectable })}
                    checked={onPage.state === 'all'}
                    disabled={
                      onPage.selectable === 0 || (onPage.state === 'none' && room <= chosen.size)
                    }
                    onChange={() => {
                      anchor.current = null;
                      setChosen((prev) => togglePage(items, prev, existing, room));
                    }}
                  />
                  <span className="text-sm font-medium">
                    <span className="sm:hidden">
                      {t('exam.picker.selectPageShort', { count: onPage.selectable })}
                    </span>
                    <span className="hidden sm:inline">
                      {t('exam.picker.selectPage', { count: onPage.selectable })}
                    </span>
                  </span>
                </label>
                {list.data && (
                  <Pagination
                    compact
                    page={list.data.page}
                    pageSize={list.data.pageSize}
                    total={list.data.total}
                    totalCapped={list.data.totalCapped}
                    onPage={setPage}
                  />
                )}
              </div>
            )}

            <div
              ref={listRef}
              data-testid="picker-list"
              className="min-h-0 flex-1 overflow-y-auto pb-2"
            >
              {list.isPending ? (
                <ListSkeleton rows={4} />
              ) : list.data && list.data.items.length === 0 ? (
                <EmptyState>{t('exam.picker.none')}</EmptyState>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {(list.data?.items ?? []).map((item, index) => {
                    const already = existing.has(item.id);
                    const checked = chosen.has(item.id);
                    return (
                      <li key={item.id} className="flex items-stretch gap-2">
                        <label
                          className={`flex min-h-12 min-w-0 flex-1 select-none items-start gap-3 rounded-lg border px-3 py-2 lg:px-2 lg:py-1.5 lg:text-sm lg:leading-snug ${
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
                            <span className="line-clamp-2 text-sm text-fg-muted wrap-anywhere lg:line-clamp-1 lg:text-xs">
                              {[
                                already && t('exam.picker.already'),
                                t(`questionType.${item.type}`),
                                // Đã lọc một Chủ đề thì không nhắc lại tên ở từng dòng.
                                !topicId && item.topicName,
                                ...item.tags,
                                t('questionBank.points', { points: item.defaultPoints }),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </label>
                        <Button
                          className="min-w-12 shrink-0 self-center lg:text-sm"
                          aria-label={t('exam.picker.detail.open', { preview: item.preview })}
                          title={t('exam.picker.detail.open', { preview: item.preview })}
                          onClick={() => setDetailId(item.id)}
                        >
                          <Eye aria-hidden className="size-5" />
                          <span className="hidden sm:inline">{t('exam.picker.detail.view')}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {filtering && (
          <div className="flex shrink-0 gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
            <Button disabled={chips.length === 0} onClick={resetFilters}>
              {t('exam.picker.resetFilters')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltering(false)}>
              {!list.data
                ? t('exam.picker.showList')
                : list.data.totalCapped
                  ? t('exam.picker.showCapped', { cap: list.data.total.toLocaleString('vi-VN') })
                  : t('exam.picker.showCount', { count: list.data.total })}
            </Button>
          </div>
        )}

        <div
          data-testid="picker-footer"
          className={`${filtering ? 'hidden lg:flex' : 'flex'} shrink-0 flex-col gap-2 border-t border-border px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:px-5`}
        >
          {!wide && sectionSelect && (
            <div className="flex items-center gap-2" data-testid="picker-destination">
              <label htmlFor="picker-section" className="shrink-0 text-sm text-fg-muted">
                {t('exam.picker.into')}
              </label>
              {sectionSelect}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center gap-x-3 text-sm">
                <span className="font-medium" aria-live="polite">
                  {t('exam.picker.chosen', { count: chosen.size })}
                </span>
                {chosen.size > 0 && (
                  <Button variant="ghost" onClick={clear}>
                    {t('exam.picker.clear')}
                  </Button>
                )}
              </div>
              {(wide || !sectionSelect) && destination}
              <p className="hidden text-xs text-fg-muted lg:block">
                {t('exam.picker.keepHint')} {t('exam.picker.shiftHint')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {/* Màn hẹp đã có nút đóng ở đầu hộp: nhường chỗ cho số câu và nút Thêm. */}
              {wide && <Button onClick={close}>{t('common.cancel')}</Button>}
              <Button
                variant="primary"
                disabled={chosen.size === 0}
                aria-label={
                  chosen.size === 0
                    ? undefined
                    : t('exam.picker.add', { count: chosen.size, section: sectionName })
                }
                onClick={add}
              >
                {chosen.size === 0
                  ? t('exam.picker.addNone')
                  : t('exam.picker.addShort', { count: chosen.size })}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
      <QuestionDetailDialog
        question={open ? detailItem : null}
        ids={items.map((item) => item.id)}
        chosen={detailItem ? chosen.has(detailItem.id) : false}
        already={detailItem ? existing.has(detailItem.id) : false}
        canChoose={chosen.size < room}
        onToggle={() => detailItem && toggleFromDetail(detailItem)}
        onNavigate={setDetailId}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
