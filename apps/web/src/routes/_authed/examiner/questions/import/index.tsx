import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Download, Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../../lib/errors';
import { formatDateTime, formatFileSize } from '../../../../../lib/format';
import { topicsQuery } from '../../../../../lib/question-bank';
import {
  IMPORT_EXAMPLE_URL,
  IMPORT_TEMPLATE_URL,
  type ImportStatus,
  importBatchesQuery,
  importKeys,
  isCancellable,
  uploadQuestionImport,
} from '../../../../../lib/question-imports';
import {
  Badge,
  BusyNotice,
  buttonClass,
  Card,
  ErrorMessage,
  PrimaryButton,
  SelectField,
} from '../../../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../../../lib/ui/admin';
import { Breadcrumb } from '../../../../../lib/ui/breadcrumb';
import { CancelImportButton } from '../../../../../lib/ui/cancel-import';
import { PageHeader } from '../../../../../lib/ui/page-header';

export const Route = createFileRoute('/_authed/examiner/questions/import/')({
  validateSearch: (search: Record<string, unknown>): { topicId?: string; page?: number } => ({
    topicId: typeof search.topicId === 'string' && search.topicId ? search.topicId : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: ImportPage,
});

const STATUS_TONE: Record<ImportStatus, 'neutral' | 'primary' | 'success' | 'danger'> = {
  parsing: 'neutral',
  parse_failed: 'danger',
  ready: 'primary',
  committing: 'neutral',
  committed: 'success',
};

function ImportPage() {
  const { t } = useTranslation();
  const { page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const batches = useQuery(importBatchesQuery(page));

  return (
    <section className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('questionBank.title'), to: '/examiner/questions' },
          { label: t('questionImport.title') },
        ]}
      />
      <PageHeader title={t('questionImport.title')} />
      <UploadCard />
      <h2 className="text-lg font-semibold">{t('questionImport.recent')}</h2>
      {batches.isPending ? (
        <ListSkeleton rows={3} />
      ) : batches.isError ? (
        <ErrorMessage>{errorMessage(t, batches.error)}</ErrorMessage>
      ) : batches.data.items.length === 0 ? (
        <EmptyState>{t('questionImport.empty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {batches.data.items.map((batch) => (
              <li
                key={batch.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"
              >
                <Link
                  to="/examiner/questions/import/$batchId"
                  params={{ batchId: batch.id }}
                  className="flex min-h-12 min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-primary-soft"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {batch.originalFilename}
                    </span>
                    <Badge tone={STATUS_TONE[batch.status]}>
                      {t(`questionImport.status.${batch.status}`)}
                    </Badge>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {batch.topicName} · {formatDateTime(batch.createdAt)}
                    {batch.status === 'committed'
                      ? ` · ${t('questionImport.createdN', { count: batch.createdCount ?? 0 })}`
                      : batch.rowCount !== null
                        ? ` · ${t('questionImport.rowsN', { count: batch.rowCount })}`
                        : ''}
                  </span>
                </Link>
                {isCancellable(batch.status) && (
                  <CancelImportButton batchId={batch.id} className="w-fit" />
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={batches.data.page}
            pageSize={batches.data.pageSize}
            total={batches.data.total}
            onPage={(p) => navigate({ search: (s) => ({ ...s, page: p }) })}
          />
        </>
      )}
    </section>
  );
}

function UploadCard() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const topics = useQuery(topicsQuery());
  const [topicId, setTopicId] = useState(search.topicId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => uploadQuestionImport(topicId, file as File),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: importKeys.all });
      await navigate({ to: '/examiner/questions/import/$batchId', params: { batchId: id } });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file && topicId) mutation.mutate();
  };

  if (topics.isSuccess && topics.data.length === 0) {
    return (
      <EmptyState>
        <span className="mb-3 block">{t('questionImport.noTopics')}</span>
        <Link to="/examiner/questions" className={buttonClass('secondary')}>
          {t('questionBank.title')}
        </Link>
      </EmptyState>
    );
  }
  return (
    <Card>
      <p className="mb-4 text-sm text-fg-muted">{t('questionImport.intro')}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <ol className="flex flex-col gap-4">
          <li className="flex flex-col gap-2">
            <Step n={1}>{t('questionImport.step1')}</Step>
            <div className="flex flex-wrap gap-2">
              <a href={IMPORT_TEMPLATE_URL} download className={buttonClass('secondary')}>
                <Download aria-hidden className="size-5" />
                {t('questionImport.downloadTemplate')}
              </a>
              <a href={IMPORT_EXAMPLE_URL} download className={buttonClass('secondary')}>
                <Download aria-hidden className="size-5" />
                {t('questionImport.downloadExample')}
              </a>
            </div>
            <p className="text-sm text-fg-muted">{t('questionImport.templateHint')}</p>
          </li>
          <li className="flex flex-col gap-2">
            <Step n={2}>{t('questionImport.step2')}</Step>
            <SelectField
              id="import-topic"
              label={t('questionImport.topic')}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              required
            >
              <option value="">{t('questionImport.chooseTopic')}</option>
              {topics.data?.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </SelectField>
          </li>
          <li className="flex flex-col gap-2">
            <Step n={3}>{t('questionImport.step3')}</Step>
            <input
              id="import-file"
              type="file"
              accept=".xlsx"
              required
              aria-label={t('questionImport.chooseFile')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-12 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-medium file:text-on-primary-soft"
            />
          </li>
        </ol>
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        {mutation.isPending && file && (
          <BusyNotice
            title={t('busy.uploading')}
            detail={`${file.name} · ${formatFileSize(file.size)}`}
            hint={t('busy.longWait')}
          />
        )}
        <PrimaryButton
          loading={mutation.isPending}
          type="submit"
          disabled={!file || !topicId || mutation.isPending}
        >
          <Upload aria-hidden className="size-5" />
          {mutation.isPending ? t('questionImport.uploading') : t('questionImport.upload')}
        </PrimaryButton>
      </form>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <p className="flex items-center gap-2 font-medium">
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm text-on-primary-soft"
      >
        {n}
      </span>
      {children}
    </p>
  );
}
