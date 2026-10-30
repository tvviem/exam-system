import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageResult } from '../../../../../lib/admin';
import { errorMessage } from '../../../../../lib/errors';
import { formatDateTime } from '../../../../../lib/format';
import {
  applySelectionToCounts,
  applySelectionToItems,
  commitImport,
  type ImportBatch,
  type ImportItem,
  type ImportKind,
  type ImportSelection,
  importBatchQuery,
  importItemsQuery,
  selectImportItems,
} from '../../../../../lib/question-imports';
import { buttonClass, Card, ErrorMessage, PrimaryButton } from '../../../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../../../lib/ui/admin';
import { Breadcrumb } from '../../../../../lib/ui/breadcrumb';
import { Chip, ChipGroup } from '../../../../../lib/ui/chips';
import { ImportItems } from '../../../../../lib/ui/import-items';
import { PageHeader } from '../../../../../lib/ui/page-header';
import { StickyActionBar } from '../../../../../lib/ui/sticky-action-bar';

const KINDS: ImportKind[] = ['valid', 'duplicate', 'error'];

export const Route = createFileRoute('/_authed/examiner/questions/import/$batchId')({
  validateSearch: (search: Record<string, unknown>): { kind?: ImportKind; page?: number } => ({
    kind: KINDS.includes(search.kind as ImportKind) ? (search.kind as ImportKind) : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: ImportBatchPage,
});

function ImportBatchPage() {
  const { t } = useTranslation();
  const { batchId } = Route.useParams();
  const batch = useQuery(importBatchQuery(batchId));

  return (
    <section className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('questionBank.title'), to: '/examiner/questions' },
          { label: t('questionImport.title'), to: '/examiner/questions/import' },
          { label: batch.data?.originalFilename ?? '…' },
        ]}
      />
      <PageHeader title={t('questionImport.title')} />
      {batch.isPending ? (
        <ListSkeleton rows={3} />
      ) : batch.isError ? (
        <ErrorMessage>{errorMessage(t, batch.error)}</ErrorMessage>
      ) : (
        <BatchBody batch={batch.data} />
      )}
    </section>
  );
}

function BatchBody({ batch }: { batch: ImportBatch }) {
  const { t } = useTranslation();
  return (
    <>
      <Card className="flex flex-col gap-1">
        <p className="break-words font-medium">{batch.originalFilename}</p>
        <p className="text-sm text-fg-muted">
          {t('questionImport.intoTopic', { topic: batch.topic.name })} ·{' '}
          {formatDateTime(batch.createdAt)}
        </p>
      </Card>

      {batch.status === 'parsing' && (
        <Card>
          <p className="flex items-center gap-3" role="status">
            <Loader2 aria-hidden className="size-5 animate-spin text-fg-muted" />
            {t('questionImport.parsingHint')}
          </p>
        </Card>
      )}
      {batch.status === 'parse_failed' && (
        <>
          <ErrorMessage>
            {t(`questionImport.parseError.${batch.parseError}`, {
              defaultValue: t('questionImport.parseError.internal_error'),
            })}
          </ErrorMessage>
          <Link
            to="/examiner/questions/import"
            search={{ topicId: batch.topic.id }}
            className={buttonClass('secondary', 'w-fit')}
          >
            {t('questionImport.tryAnotherFile')}
          </Link>
        </>
      )}
      {(batch.status === 'ready' ||
        batch.status === 'committing' ||
        batch.status === 'committed') && <Preview batch={batch} />}
    </>
  );
}

function Preview({ batch }: { batch: ImportBatch }) {
  const { t } = useTranslation();
  const { kind, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const ready = batch.status === 'ready';
  const { counts } = batch;
  const items = useQuery(
    importItemsQuery(batch.id, { kind, page }, `${batch.status}:${batch.createdCount}`),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['question-imports'] });
  const itemsKey = ['question-imports', 'items', batch.id];
  const batchKey = importBatchQuery(batch.id).queryKey;
  // Ô chọn đổi ngay, không chờ server (mạng chậm trên điện thoại); lỗi thì trả về như cũ.
  const select = useMutation({
    mutationFn: (args: { selection: ImportSelection; on: boolean }) =>
      selectImportItems(batch.id, args.selection, args.on),
    onMutate: async ({ selection, on }) => {
      await queryClient.cancelQueries({ queryKey: ['question-imports'] });
      const previousItems = queryClient.getQueriesData<PageResult<ImportItem>>({
        queryKey: itemsKey,
      });
      const previousBatch = queryClient.getQueryData<ImportBatch>(batchKey);
      const loaded = items.data?.items ?? [];
      queryClient.setQueriesData<PageResult<ImportItem>>(
        { queryKey: itemsKey },
        (old) => old && { ...old, items: applySelectionToItems(old.items, selection, on) },
      );
      queryClient.setQueryData<ImportBatch>(
        batchKey,
        (old) =>
          old && { ...old, counts: applySelectionToCounts(old.counts, loaded, selection, on) },
      );
      return { previousItems, previousBatch };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previousItems ?? []) queryClient.setQueryData(key, data);
      if (context?.previousBatch) queryClient.setQueryData(batchKey, context.previousBatch);
    },
    onSettled: refresh,
  });
  const commit = useMutation({ mutationFn: () => commitImport(batch.id), onSuccess: refresh });
  const toggle = (item: ImportItem) =>
    select.mutate({ selection: { itemIds: [item.id] }, on: !item.selected });

  // Đang tạo xong thì cuộn lên đầu để thấy kết quả.
  const wasCommitting = useRef(false);
  useEffect(() => {
    if (batch.status === 'committing') wasCommitting.current = true;
    if (batch.status === 'committed' && wasCommitting.current) window.scrollTo({ top: 0 });
  }, [batch.status]);

  const setKind = (next?: ImportKind) =>
    navigate({ search: (s) => ({ ...s, kind: next, page: undefined }) });
  const total = batch.rowCount ?? 0;

  return (
    <>
      {batch.status === 'committing' && (
        <Card>
          <p className="flex items-center gap-3" role="status">
            <Loader2 aria-hidden className="size-5 animate-spin text-fg-muted" />
            {t('questionImport.committingHint')}
          </p>
        </Card>
      )}
      {batch.status === 'committed' && (
        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-medium text-success" role="status">
            <CheckCircle2 aria-hidden className="size-5" />
            {t('questionImport.doneTitle', { count: batch.createdCount ?? 0 })}
          </p>
          <p className="text-sm text-fg-muted">
            {t('questionImport.doneHint', { topic: batch.topic.name })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/examiner/questions"
              search={{ topicId: batch.topic.id }}
              className={buttonClass('primary')}
            >
              {t('questionImport.viewQuestions')}
            </Link>
            <Link
              to="/examiner/questions/import"
              search={{ topicId: batch.topic.id }}
              className={buttonClass('secondary')}
            >
              <Plus aria-hidden className="size-5" />
              {t('questionImport.importAnother')}
            </Link>
          </div>
        </Card>
      )}

      <ChipGroup label={t('questionImport.filterRows')}>
        <Chip active={!kind} count={total} onClick={() => setKind(undefined)}>
          {t('questionImport.allRows')}
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} count={counts[k]} onClick={() => setKind(k)}>
            {t(`questionImport.kind.${k}`)}
          </Chip>
        ))}
      </ChipGroup>

      {ready && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <GroupToggle
            label={t('questionImport.selectValid', { count: counts.valid })}
            total={counts.valid}
            selected={counts.selectedValid}
            disabled={select.isPending}
            onChange={(on) => select.mutate({ selection: { group: 'valid' }, on })}
          />
          <GroupToggle
            label={t('questionImport.selectDuplicate', { count: counts.duplicate })}
            total={counts.duplicate}
            selected={counts.selectedDuplicate}
            disabled={select.isPending}
            onChange={(on) => select.mutate({ selection: { group: 'duplicate' }, on })}
          />
        </div>
      )}
      <ErrorMessage>{select.isError && errorMessage(t, select.error)}</ErrorMessage>

      {items.isPending ? (
        <ListSkeleton />
      ) : items.isError ? (
        <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>
      ) : items.data.items.length === 0 ? (
        <EmptyState>{t('questionImport.itemsEmpty')}</EmptyState>
      ) : (
        <>
          <ImportItems
            items={items.data.items}
            selectable={ready}
            pending={select.isPending}
            onToggle={toggle}
          />
          <Pagination
            page={items.data.page}
            pageSize={items.data.pageSize}
            total={items.data.total}
            onPage={(p) => navigate({ search: (s) => ({ ...s, page: p }) })}
          />
        </>
      )}

      {ready && (
        <StickyActionBar>
          <ErrorMessage>{commit.isError && errorMessage(t, commit.error)}</ErrorMessage>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-fg-muted" aria-live="polite">
              {t('questionImport.selectedN', { count: counts.selected })}
            </span>
            <PrimaryButton
              disabled={counts.selected === 0 || commit.isPending || select.isPending}
              onClick={() => commit.mutate()}
            >
              {commit.isPending
                ? t('questionImport.creating')
                : t('questionImport.create', { count: counts.selected })}
            </PrimaryButton>
          </div>
        </StickyActionBar>
      )}
    </>
  );
}

/** Ô chọn cả nhóm; chọn một phần thì hiện trạng thái trung gian. */
function GroupToggle({
  label,
  total,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  total: number;
  selected: number;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const all = total > 0 && selected === total;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);
  if (total === 0) return null;
  return (
    <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium pointer-fine:min-h-9">
      <input
        ref={ref}
        type="checkbox"
        className="size-5"
        checked={all}
        disabled={disabled}
        onChange={() => onChange(!all)}
      />
      {label}
    </label>
  );
}
