import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { createExam, EXAM_STATUSES, type ExamStatus, examsQuery } from '../../../../lib/exams';
import { formatDateTime } from '../../../../lib/format';
import {
  Badge,
  Button,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  SearchField,
  TextField,
} from '../../../../lib/ui';
import { EmptyState, ListSkeleton, Pagination } from '../../../../lib/ui/admin';
import { Chip, ChipGroup } from '../../../../lib/ui/chips';
import { PageHeader } from '../../../../lib/ui/page-header';

export const Route = createFileRoute('/_authed/examiner/exams/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: ExamStatus; q?: string; page?: number } => ({
    status: EXAM_STATUSES.includes(search.status as ExamStatus)
      ? (search.status as ExamStatus)
      : undefined,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    page: Number(search.page) > 1 ? Number(search.page) : undefined,
  }),
  component: ExamsPage,
});

const STATUS_TONE = { draft: 'neutral', published: 'success', archived: 'warning' } as const;

function ExamsPage() {
  const { t } = useTranslation();
  const { status, q, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const exams = useQuery(examsQuery({ status, q, page }));
  const [text, setText] = useState(q ?? '');
  const [creating, setCreating] = useState(false);

  // Chờ gõ xong một nhịp rồi mới đưa từ khóa lên địa chỉ (và hỏi api).
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim() || undefined;
      if (next !== q) navigate({ search: (s) => ({ ...s, q: next, page: undefined }) });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const setStatus = (next?: ExamStatus) =>
    navigate({ search: (s) => ({ ...s, status: next, page: undefined }) });

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={t('exam.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-5" />
            {t('exam.create')}
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_1fr] sm:items-end">
        <SearchField
          id="exam-search"
          label={t('exam.search')}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        <ChipGroup label={t('exam.filterStatus')}>
          <Chip active={!status} onClick={() => setStatus(undefined)}>
            {t('exam.statusDefault')}
          </Chip>
          {EXAM_STATUSES.map((value) => (
            <Chip key={value} active={status === value} onClick={() => setStatus(value)}>
              {t(`exam.status.${value}`)}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      {exams.isPending ? (
        <ListSkeleton rows={4} />
      ) : exams.isError ? (
        <ErrorMessage>{errorMessage(t, exams.error)}</ErrorMessage>
      ) : exams.data.items.length === 0 ? (
        <EmptyState>{q || status ? t('exam.listNoMatch') : t('exam.listEmpty')}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {exams.data.items.map((exam) => (
              <li key={exam.id}>
                <Link
                  to="/examiner/exams/$examId"
                  params={{ examId: exam.id }}
                  className="flex min-h-12 flex-col gap-1 rounded-xl border border-border bg-surface p-4 hover:bg-primary-soft"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{exam.title}</span>
                    <Badge tone={STATUS_TONE[exam.status]}>{t(`exam.status.${exam.status}`)}</Badge>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {t('exam.meta', { items: exam.itemCount, points: exam.totalPoints })} ·{' '}
                    {t('exam.updatedAt', { time: formatDateTime(exam.updatedAt) })}
                    {exam.sessionCount > 0 &&
                      ` · ${t('exam.sessionCount', { count: exam.sessionCount })}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={exams.data.page}
            pageSize={exams.data.pageSize}
            total={exams.data.total}
            onPage={(p) => navigate({ search: (s) => ({ ...s, page: p }) })}
          />
        </>
      )}

      <CreateExamDialog open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}

function CreateExamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: () => createExam(title),
    onSuccess: async (exam) => {
      await queryClient.invalidateQueries({ queryKey: ['exams', 'list'] });
      setTitle('');
      onClose();
      await navigate({ to: '/examiner/exams/$examId', params: { examId: exam.id } });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) create.mutate();
  };
  return (
    <Dialog open={open} onClose={onClose} title={t('exam.createTitle')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          id="new-exam-title"
          label={t('exam.name')}
          value={title}
          maxLength={200}
          required
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <ErrorMessage>{create.isError && errorMessage(t, create.error)}</ErrorMessage>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <PrimaryButton type="submit" disabled={!title.trim() || create.isPending}>
            {create.isPending ? t('exam.creating') : t('exam.create')}
          </PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
