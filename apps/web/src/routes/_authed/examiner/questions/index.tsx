import { normalizeForSearch } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileSpreadsheet, FolderCog, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import {
  archiveQuestions,
  deleteQuestions,
  examCountOf,
  moveQuestions,
  QUESTION_TYPES,
  type QuestionListItem,
  type QuestionListParams,
  type QuestionType,
  questionsQuery,
  restoreQuestions,
  topicsQuery,
} from '../../../../lib/question-bank';
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  SearchField,
  SelectField,
  TextField,
} from '../../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../../lib/ui/admin';
import { Chip, ChipGroup } from '../../../../lib/ui/chips';
import { DataList } from '../../../../lib/ui/data-list';
import { FilterBar } from '../../../../lib/ui/filter-bar';
import { PageHeader } from '../../../../lib/ui/page-header';
import { StickyActionBar } from '../../../../lib/ui/sticky-action-bar';
import { useToast } from '../../../../lib/ui/toast';
import { TopicManager } from '../../../../lib/ui/topic-manager';

export const Route = createFileRoute('/_authed/examiner/questions/')({
  validateSearch: (search: Record<string, unknown>): QuestionListParams => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    topicId: typeof search.topicId === 'string' && search.topicId ? search.topicId : undefined,
    type: QUESTION_TYPES.includes(search.type as QuestionType)
      ? (search.type as QuestionType)
      : undefined,
    tag: typeof search.tag === 'string' && search.tag ? search.tag : undefined,
    archived: search.archived === true || search.archived === 'true' ? true : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: QuestionBankPage,
});

function QuestionBankPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const topics = useQuery(topicsQuery());
  const questions = useQuery(questionsQuery(search));
  const [q, setQ] = useState(search.q ?? '');
  const [tag, setTag] = useState(search.tag ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState(false);
  const [choosingType, setChoosingType] = useState(false);
  const [topicQuery, setTopicQuery] = useState('');
  // Từ 7 Chủ đề trở lên chip lọc thành ô chọn (điện thoại); từ 9 thì cột bên có ô tìm và vùng cuộn (laptop).
  const topicCount = topics.data?.length ?? 0;
  const manyTopics = topicCount > 8;
  const visibleTopics = (topics.data ?? []).filter((topic) =>
    normalizeForSearch(topic.name).includes(normalizeForSearch(topicQuery)),
  );

  // Tìm khi ngừng gõ 300 ms; thay URL thay vì thêm lịch sử.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.q ?? '') !== q.trim() || (search.tag ?? '') !== tag.trim()) {
        void navigate({
          search: (s) => ({
            ...s,
            q: q.trim() || undefined,
            tag: tag.trim() || undefined,
            page: undefined,
          }),
          replace: true,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, tag, search.q, search.tag, navigate]);

  // Đổi bộ lọc hoặc trang thì bỏ chọn, để thao tác hàng loạt không chạm vào dòng đã khuất.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ cần theo dõi tham số tìm
  useEffect(
    () => setSelected(new Set()),
    [search.q, search.topicId, search.type, search.tag, search.archived, search.page],
  );

  const setFilter = (patch: Partial<QuestionListParams>) =>
    navigate({ search: (s) => ({ ...s, ...patch, page: undefined }) });
  const activeFilters = [search.type, search.tag, search.archived].filter(Boolean).length;
  const total = topics.data?.reduce((sum, topic) => sum + (topic.questionCount ?? 0), 0) ?? 0;
  const noTopics = topics.isSuccess && topics.data.length === 0;

  const filters = (
    <>
      <SelectField
        id="filter-type"
        label={t('questionBank.type')}
        value={search.type ?? ''}
        onChange={(e) => setFilter({ type: (e.target.value || undefined) as QuestionType })}
      >
        <option value="">{t('questionBank.allTypes')}</option>
        {QUESTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`questionType.${type}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="filter-archived"
        label={t('questionBank.statusFilter')}
        value={search.archived ? 'archived' : 'active'}
        onChange={(e) => setFilter({ archived: e.target.value === 'archived' ? true : undefined })}
      >
        <option value="active">{t('questionBank.statusActive')}</option>
        <option value="archived">{t('questionBank.statusArchived')}</option>
      </SelectField>
      <TextField
        id="filter-tag"
        label={t('questionBank.tag')}
        value={tag}
        onChange={(e) => setTag(e.target.value)}
      />
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={t('questionBank.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setManaging(true)}>
              <FolderCog aria-hidden className="size-5" />
              {t('questionBank.manageTopics')}
            </Button>
            <Link
              to="/examiner/questions/import"
              search={{ topicId: search.topicId }}
              className={buttonClass('secondary')}
            >
              <FileSpreadsheet aria-hidden className="size-5" />
              {t('questionBank.importExcel')}
            </Link>
            <PrimaryButton onClick={() => setChoosingType(true)}>
              <Plus aria-hidden className="size-5" />
              {t('questionBank.newQuestion')}
            </PrimaryButton>
          </div>
        }
      />

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-6">
        {/* Laptop: Chủ đề là cột bên trái; điện thoại: chip lọc (docs/ui-design.md mục 10). */}
        <aside className="hidden lg:block">
          <Card className="sticky top-[calc(var(--app-header-h)+1rem)] flex flex-col gap-1 p-3">
            <h2 className="px-2 pb-1 text-sm font-semibold text-fg-muted">
              {t('questionBank.topics')}
            </h2>
            <TopicLink
              active={!search.topicId}
              onClick={() => setFilter({ topicId: undefined })}
              count={total}
            >
              {t('questionBank.allTopics')}
            </TopicLink>
            {manyTopics && (
              <div className="px-1 pb-1">
                <SearchField
                  id="topic-filter"
                  label={t('questionBank.searchTopics')}
                  value={topicQuery}
                  onChange={(e) => setTopicQuery(e.target.value)}
                />
              </div>
            )}
            <div className="flex max-h-[55dvh] flex-col gap-1 overflow-y-auto">
              {visibleTopics.map((topic) => (
                <TopicLink
                  key={topic.id}
                  active={search.topicId === topic.id}
                  count={topic.questionCount ?? 0}
                  onClick={() => setFilter({ topicId: topic.id })}
                >
                  {topic.name}
                </TopicLink>
              ))}
              {manyTopics && visibleTopics.length === 0 && (
                <p className="px-2 py-2 text-sm text-fg-muted">
                  {t('questionBank.noTopicMatch', { q: topicQuery.trim() })}
                </p>
              )}
            </div>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="lg:hidden">
            {topicCount > 6 ? (
              <SelectField
                id="topic-picker"
                label={t('questionBank.topicPicker')}
                value={search.topicId ?? ''}
                onChange={(e) => setFilter({ topicId: e.target.value || undefined })}
              >
                <option value="">
                  {t('questionBank.allTopics')} ({total})
                </option>
                {topics.data?.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name} ({topic.questionCount ?? 0})
                  </option>
                ))}
              </SelectField>
            ) : (
              <ChipGroup label={t('questionBank.topics')}>
                <Chip
                  active={!search.topicId}
                  count={total}
                  onClick={() => setFilter({ topicId: undefined })}
                >
                  {t('questionBank.allTopics')}
                </Chip>
                {topics.data?.map((topic) => (
                  <Chip
                    key={topic.id}
                    active={search.topicId === topic.id}
                    count={topic.questionCount ?? 0}
                    onClick={() => setFilter({ topicId: topic.id })}
                  >
                    {topic.name}
                  </Chip>
                ))}
              </ChipGroup>
            )}
          </div>

          <FilterBar
            activeCount={activeFilters}
            wide
            filters={filters}
            search={
              <SearchField
                id="question-search"
                label={t('questionBank.search')}
                placeholder={t('questionBank.searchPlaceholder')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            }
          />

          {noTopics ? (
            <EmptyState>
              <span className="mb-3 block">{t('questionBank.emptyNoTopics')}</span>
              <Button onClick={() => setManaging(true)}>{t('questionBank.addTopic')}</Button>
            </EmptyState>
          ) : questions.isPending ? (
            <ListSkeleton />
          ) : questions.isError ? (
            <ErrorMessage>{errorMessage(t, questions.error)}</ErrorMessage>
          ) : questions.data.items.length === 0 ? (
            <EmptyState>{t('questionBank.empty')}</EmptyState>
          ) : (
            <>
              <QuestionList
                items={questions.data.items}
                selected={selected}
                setSelected={setSelected}
              />
              <Pagination
                page={questions.data.page}
                pageSize={questions.data.pageSize}
                total={questions.data.total}
                onPage={(page) => navigate({ search: (s) => ({ ...s, page }) })}
              />
              {selected.size > 0 && (
                <BulkBar
                  items={questions.data.items.filter((item) => selected.has(item.id))}
                  archivedView={Boolean(search.archived)}
                  onDone={() => setSelected(new Set())}
                />
              )}
            </>
          )}
        </div>
      </div>

      <TopicManager open={managing} onClose={() => setManaging(false)} />
      <TypeChooser
        open={choosingType}
        onClose={() => setChoosingType(false)}
        topicId={search.topicId}
        noTopics={noTopics}
      />
    </section>
  );
}

function TopicLink({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-medium pointer-fine:min-h-9 ${
        active ? 'bg-primary-soft text-on-primary-soft' : 'text-fg hover:bg-primary-soft'
      }`}
    >
      <span className="truncate">{children}</span>
      <span className="tabular-nums text-fg-muted">{count}</span>
    </button>
  );
}

/** Câu đã Lưu trữ hoặc đang nằm trong Bộ đề (Q174). */
function UsageBadges({ item }: { item: QuestionListItem }) {
  const { t } = useTranslation();
  const exams = examCountOf(item);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {item.archivedAt && <Badge tone="warning">{t('questionBank.archivedBadge')}</Badge>}
      {exams > 0 && <Badge>{t('questionBank.inExams', { count: exams })}</Badge>}
    </span>
  );
}

function QuestionList({
  items,
  selected,
  setSelected,
}: {
  items: QuestionListItem[];
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  };
  const allSelected = items.every((item) => selected.has(item.id));
  const checkbox = (item: QuestionListItem) => (
    <label className="inline-flex size-12 cursor-pointer items-center justify-center pointer-fine:size-9">
      <input
        type="checkbox"
        className="size-5"
        checked={selected.has(item.id)}
        aria-label={t('questionBank.selectQuestion', { preview: item.preview.slice(0, 40) })}
        onChange={() => toggle(item.id)}
      />
    </label>
  );
  const link = (item: QuestionListItem) => (
    <Link
      to="/examiner/questions/$questionId"
      params={{ questionId: item.id }}
      className="font-medium text-primary hover:underline"
    >
      {item.preview || t('questionBank.noPreview')}
    </Link>
  );
  const selectAll = (className: string) => (
    <label className={className}>
      <input
        type="checkbox"
        className="size-5"
        checked={allSelected}
        aria-label={t('questionBank.selectAll')}
        onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
      />
    </label>
  );
  return (
    <>
      {/* Dưới 768 px danh sách là các thẻ, không có hàng tiêu đề nên ô chọn mọi câu nằm phía trên. */}
      <div className="flex items-center gap-1 text-sm md:hidden">
        {selectAll('inline-flex size-12 cursor-pointer items-center justify-center')}
        <span aria-hidden>{t('questionBank.selectAll')}</span>
      </div>
      <DataList
        items={items}
        rowKey={(item) => item.id}
        selectionHeader={selectAll(
          'inline-flex size-12 cursor-pointer items-center justify-center pointer-fine:size-9',
        )}
        selectionCell={checkbox}
        columns={[
          {
            key: 'stem',
            header: t('questionBank.stem'),
            cell: (item) => link(item),
            className: 'max-w-xl',
          },
          {
            key: 'type',
            header: t('questionBank.type'),
            cell: (item) => <Badge tone="primary">{t(`questionType.${item.type}`)}</Badge>,
          },
          {
            key: 'usage',
            header: t('questionBank.usage'),
            from: 'lg',
            cell: (item) => <UsageBadges item={item} />,
          },
          {
            key: 'topic',
            header: t('questionBank.topic'),
            from: 'lg',
            className: 'text-fg-muted',
            cell: (item) => item.topicName,
          },
          {
            key: 'points',
            header: t('questionBank.pointsShort'),
            className: 'tabular-nums',
            cell: (item) => item.defaultPoints,
          },
          {
            key: 'updated',
            header: t('questionBank.updatedAt'),
            from: 'lg',
            className: 'text-fg-muted',
            cell: (item) => new Date(item.updatedAt).toLocaleDateString('vi-VN'),
          },
        ]}
        card={(item) => (
          <div className="flex items-start gap-1 rounded-xl border border-border bg-surface pr-3">
            {checkbox(item)}
            <Link
              to="/examiner/questions/$questionId"
              params={{ questionId: item.id }}
              className="flex min-w-0 flex-1 items-center gap-3 py-3 hover:underline"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-medium">
                  {item.preview || t('questionBank.noPreview')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                  <Badge tone="primary">{t(`questionType.${item.type}`)}</Badge>
                  <span>{item.topicName}</span>
                  <span className="tabular-nums">
                    {t('questionBank.points', { points: item.defaultPoints })}
                  </span>
                  <UsageBadges item={item} />
                </div>
              </div>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted" />
            </Link>
          </div>
        )}
      />
    </>
  );
}

function BulkBar({
  items,
  archivedView,
  onDone,
}: {
  items: QuestionListItem[];
  archivedView: boolean;
  onDone: () => void;
}) {
  const ids = items.map((item) => item.id);
  // Câu đã nằm trong Bộ đề thì không xóa được, chỉ Lưu trữ (Q174).
  const anyUsed = items.some((item) => examCountOf(item) > 0);
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const topics = useQuery(topicsQuery());
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['questions'] });
    await queryClient.invalidateQueries({ queryKey: ['topics'] });
  };
  const move = useMutation({
    mutationFn: () => moveQuestions(ids, target),
    onSuccess: async () => {
      setMoving(false);
      await refresh();
      toast(t('questionBank.moved', { count: ids.length }));
      onDone();
    },
  });
  const archive = useMutation({
    mutationFn: () => (archivedView ? restoreQuestions(ids) : archiveQuestions(ids)),
    onSuccess: async () => {
      await refresh();
      toast(
        t(archivedView ? 'questionBank.restoredMany' : 'questionBank.archivedMany', {
          count: ids.length,
        }),
      );
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuestions(ids),
    onSuccess: async () => {
      setDeleting(false);
      await refresh();
      toast(t('questionBank.deletedMany', { count: ids.length }));
      onDone();
    },
  });

  return (
    <>
      <StickyActionBar>
        <p className="text-sm font-medium">
          {t('questionBank.selectedCount', { count: ids.length })}
        </p>
        {anyUsed && <p className="text-sm text-fg-muted">{t('questionBank.usedHint')}</p>}
        {archive.isError && <ErrorMessage>{errorMessage(t, archive.error)}</ErrorMessage>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMoving(true)}>{t('questionBank.moveTopic')}</Button>
          <Button disabled={archive.isPending} onClick={() => archive.mutate()}>
            {archivedView ? t('questionBank.restore') : t('questionBank.archive')}
          </Button>
          {anyUsed ? null : (
            <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden className="size-5" />
              {t('questionBank.delete')}
            </Button>
          )}
          <Button onClick={onDone}>{t('questionBank.clearSelection')}</Button>
        </div>
      </StickyActionBar>

      <Dialog
        open={moving}
        onClose={() => setMoving(false)}
        title={t('questionBank.moveTitle', { count: ids.length })}
      >
        <SelectField
          id="move-target"
          label={t('questionBank.targetTopic')}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">{t('questionBank.chooseTopic')}</option>
          {topics.data?.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </SelectField>
        <ErrorMessage>{move.isError && errorMessage(t, move.error)}</ErrorMessage>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <PrimaryButton disabled={!target || move.isPending} onClick={() => move.mutate()}>
            {t('questionBank.moveTopic')}
          </PrimaryButton>
          <Button onClick={() => setMoving(false)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('questionBank.deleteManyTitle', { count: ids.length })}
      >
        <p>{t('questionBank.deleteBody')}</p>
        <ErrorMessage>{remove.isError && errorMessage(t, remove.error)}</ErrorMessage>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('questionBank.delete')}
          </Button>
          <Button onClick={() => setDeleting(false)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>
    </>
  );
}

function TypeChooser({
  open,
  onClose,
  topicId,
  noTopics,
}: {
  open: boolean;
  onClose: () => void;
  topicId?: string;
  noTopics: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('questionBank.chooseType')}>
      {noTopics ? (
        <p>{t('questionBank.emptyNoTopics')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {QUESTION_TYPES.map((type) => (
            <li key={type}>
              <Link
                to="/examiner/questions/new"
                search={{ type, topicId }}
                className="flex min-h-12 flex-col justify-center rounded-lg border border-border bg-surface px-4 py-2 hover:border-primary"
              >
                <span className="font-medium">{t(`questionType.${type}`)}</span>
                <span className="text-sm text-fg-muted">{t(`questionTypeHint.${type}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={onClose}>{t('common.cancel')}</Button>
    </Dialog>
  );
}
