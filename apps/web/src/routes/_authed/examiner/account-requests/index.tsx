import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Download, Upload } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  accountRequestsQuery,
  TEMPLATE_URL,
  uploadAccountRequest,
} from '../../../../lib/account-requests';
import { errorMessage } from '../../../../lib/errors';
import { formatFileSize } from '../../../../lib/format';
import {
  BusyNotice,
  buttonClass,
  Card,
  ErrorMessage,
  PrimaryButton,
  TextField,
} from '../../../../lib/ui';
import { RequestListItem } from '../../../../lib/ui/account-request-list';
import { EmptyState, ListSkeleton, Pagination } from '../../../../lib/ui/admin';

export const Route = createFileRoute('/_authed/examiner/account-requests/')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: ExaminerAccountRequestsPage,
});

function ExaminerAccountRequestsPage() {
  const { t } = useTranslation();
  const { page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const requests = useQuery(accountRequestsQuery({ page }));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('accountRequests.heading')}</h1>
      <UploadCard />
      {requests.isPending ? (
        <ListSkeleton />
      ) : requests.isError ? (
        <ErrorMessage>{errorMessage(t, requests.error)}</ErrorMessage>
      ) : requests.data.items.length === 0 ? (
        <EmptyState>{t('accountRequests.empty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {requests.data.items.map((item) => (
              <li key={item.id}>
                <RequestListItem item={item} admin={false} />
              </li>
            ))}
          </ul>
          <Pagination
            page={requests.data.page}
            pageSize={requests.data.pageSize}
            total={requests.data.total}
            onPage={(p) => navigate({ search: { page: p } })}
          />
        </>
      )}
    </section>
  );
}

function UploadCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => uploadAccountRequest(file as File, note),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['account-requests'] });
      await navigate({ to: '/examiner/account-requests/$requestId', params: { requestId: id } });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file) mutation.mutate();
  };
  return (
    <Card>
      <p className="mb-4 text-sm text-fg-muted">{t('accountRequests.intro')}</p>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <a href={TEMPLATE_URL} download className={buttonClass('secondary', 'w-fit')}>
          <Download aria-hidden className="size-5" />
          {t('accountRequests.downloadTemplate')}
        </a>
        <div className="flex flex-col gap-1">
          <label htmlFor="request-file" className="text-sm font-medium">
            {t('accountRequests.chooseFile')}
          </label>
          <input
            id="request-file"
            type="file"
            accept=".xlsx,.csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-h-12 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:font-medium file:text-on-primary-soft"
          />
        </div>
        <TextField
          id="request-note"
          label={t('accountRequests.note')}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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
          disabled={!file || mutation.isPending}
        >
          <Upload aria-hidden className="size-5" />
          {mutation.isPending ? t('accountRequests.submitting') : t('accountRequests.submit')}
        </PrimaryButton>
      </form>
    </Card>
  );
}
