import { sessionEditableFields } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Copy, Eye, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { PHASE_TONE } from '../../../../lib/session-phase';
import {
  cancelSession,
  deleteSession,
  duplicateSession,
  type SessionSummary,
  saveSession,
  sessionQuery,
} from '../../../../lib/sessions';
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Dialog,
  ErrorMessage,
  PrimaryButton,
  TextField,
} from '../../../../lib/ui';
import { ListSkeleton } from '../../../../lib/ui/admin';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { ResultsScreen } from '../../../../lib/ui/grading/results-screen';
import { MonitorScreen } from '../../../../lib/ui/monitor/screen';
import { PageHeader } from '../../../../lib/ui/page-header';
import { RowMenu } from '../../../../lib/ui/row-menu';
import {
  draftOf,
  inputOf,
  invalidFields,
  type SessionDraft,
  SessionFields,
} from '../../../../lib/ui/session-fields';
import { SessionRoster } from '../../../../lib/ui/session-roster';
import { StickyActionBar } from '../../../../lib/ui/sticky-action-bar';
import { Tabs } from '../../../../lib/ui/tabs';
import { useToast } from '../../../../lib/ui/toast';

type Tab = 'overview' | 'roster' | 'monitor' | 'results';

export const Route = createFileRoute('/_authed/examiner/sessions/$sessionId')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab:
      search.tab === 'roster' || search.tab === 'monitor' || search.tab === 'results'
        ? search.tab
        : undefined,
  }),
  // Tab Theo dõi cần chỗ rộng cho Bảng và Lưới (Q107).
  staticData: { wide: true },
  component: SessionPage,
});

function SessionPage() {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();
  // Luôn nạp bản mới khi mở trang để `version` đúng với server (như trình soạn Bộ đề).
  const session = useQuery({ ...sessionQuery(sessionId), staleTime: 0, gcTime: 0 });
  if (session.isPending) return <ListSkeleton rows={3} />;
  if (session.isError) return <ErrorMessage>{errorMessage(t, session.error)}</ErrorMessage>;
  return (
    <SessionDetail key={`${session.data.id}-${session.data.version}`} session={session.data} />
  );
}

function SessionDetail({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const { tab = 'overview' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const rules = sessionEditableFields(session.phase);
  const canEdit = Object.keys(rules).length > 0;
  const cancelled = session.phase === 'cancelled';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });
  const duplicate = useMutation({
    mutationFn: () => duplicateSession(session.id),
    onSuccess: async (copy) => {
      await refresh();
      toast(t('session.action.duplicated'));
      await navigate({ to: '/examiner/sessions/$sessionId', params: { sessionId: copy.id } });
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  const cancel = useMutation({
    mutationFn: () => cancelSession(session.id, reason),
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
      toast(t('session.action.cancelled'));
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteSession(session.id),
    onSuccess: async () => {
      // Gỡ truy vấn chi tiết của Phiên thi vừa xóa: làm mới nó sẽ nhận 404 rồi thử lại ~7 giây trước khi chuyển trang.
      queryClient.removeQueries({ queryKey: sessionQuery(session.id).queryKey });
      toast(t('session.action.deleted'));
      await navigate({ to: '/examiner/sessions' });
      void refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('session.crumb.list'), to: '/examiner/sessions' },
          { label: session.title },
        ]}
      />
      <PageHeader
        title={session.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PHASE_TONE[session.phase]}>{t(`session.phase.${session.phase}`)}</Badge>
            <Button
              disabled={!canEdit || editing}
              title={canEdit ? undefined : t('session.hint.editDisabled')}
              onClick={() => {
                setEditing(true);
                void navigate({ search: {} });
              }}
            >
              <Pencil aria-hidden className="size-5" />
              {t('session.action.edit')}
            </Button>
            <Link
              to="/examiner/sessions/$sessionId/try"
              params={{ sessionId: session.id }}
              className={buttonClass('secondary')}
            >
              <Eye aria-hidden className="size-5" />
              {t('session.action.preview')}
            </Link>
            <RowMenu
              label={t('session.action.more')}
              items={[
                {
                  label: t('session.action.duplicate'),
                  icon: <Copy aria-hidden className="size-4" />,
                  disabled: duplicate.isPending,
                  onSelect: () => duplicate.mutate(),
                },
                {
                  label: t('session.action.cancel'),
                  disabled: cancelled,
                  hint: cancelled ? t('session.hint.cancelDisabled') : undefined,
                  onSelect: () => setConfirm('cancel'),
                },
                {
                  label: t('session.action.delete'),
                  icon: <Trash2 aria-hidden className="size-4" />,
                  danger: true,
                  onSelect: () => setConfirm('delete'),
                },
              ]}
            />
          </div>
        }
      />

      <Tabs
        label={t('session.tabs.label')}
        value={tab}
        onChange={(id) =>
          navigate({
            search: id === 'roster' || id === 'monitor' || id === 'results' ? { tab: id } : {},
          })
        }
        items={[
          {
            id: 'overview',
            label: t('session.tabs.overview'),
            content: editing ? (
              <EditForm session={session} onDone={() => setEditing(false)} />
            ) : (
              <Overview session={session} />
            ),
          },
          {
            id: 'roster',
            label: t('session.tabs.roster'),
            content: <SessionRoster session={session} />,
          },
          {
            id: 'monitor',
            label: t('session.tabs.monitor'),
            // Chỉ dựng khi đang xem: tab ẩn vẫn nằm trong cây, nhưng không được hỏi lại số liệu mỗi 5 giây.
            content: tab === 'monitor' ? <MonitorScreen sessionId={session.id} /> : null,
          },
          {
            id: 'results',
            label: t('session.tabs.results'),
            // Chỉ dựng khi đang xem: mở màn Kết quả là chấm bù Lượt thiếu và đọc điểm cả Phiên thi.
            content: tab === 'results' ? <ResultsScreen sessionId={session.id} /> : null,
          },
        ]}
      />

      <Dialog
        open={confirm === 'cancel'}
        onClose={() => setConfirm(null)}
        title={t('session.cancelDialog.title')}
      >
        <p className="text-sm text-fg-muted">{t('session.cancelDialog.body')}</p>
        <TextField
          id="cancel-reason"
          label={t('session.cancelDialog.reason')}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
        <ErrorMessage>{cancel.isError && errorMessage(t, cancel.error)}</ErrorMessage>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setConfirm(null)}>{t('session.cancelDialog.keep')}</Button>
          <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('session.cancelDialog.confirm')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={t('session.deleteDialog.title')}
      >
        <p className="text-sm text-fg-muted">{t('session.deleteDialog.body')}</p>
        <ErrorMessage>{remove.isError && errorMessage(t, remove.error)}</ErrorMessage>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('session.deleteDialog.confirm')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Overview({ session }: { session: SessionSummary }) {
  const { t } = useTranslation();
  const toast = useToast();
  const yes = (value: boolean) => t(value ? 'session.overview.yes' : 'session.overview.no');
  const onOff = (value: boolean) => t(value ? 'session.overview.on' : 'session.overview.off');
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.accessCode);
      toast(t('session.action.copied'));
    } catch {
      // Trình duyệt chặn bảng nhớ tạm: người dùng vẫn đọc và gõ lại được mã hiển thị.
    }
  };
  return (
    <Card>
      <dl className="flex flex-col gap-3">
        <Row label={t('session.overview.exam')}>{session.examTitle}</Row>
        <Row label={t('session.overview.window')}>
          {t('session.window', {
            opens: formatDateTime(session.opensAt),
            closes: formatDateTime(session.closesAt),
          })}
        </Row>
        <Row label={t('session.overview.duration')}>
          {t('session.overview.durationValue', { minutes: session.durationMinutes })}
        </Row>
        <Row label={t('session.overview.hardClose')}>{onOff(session.hardClose)}</Row>
        <Row label={t('session.overview.attempts')}>
          {session.maxAttempts}
          {session.maxAttempts > 1 && ` · ${t(`session.field.${session.attemptScoring}`)}`}
        </Row>
        <Row label={t('session.overview.shuffle')}>
          {t('session.overview.shuffleValue', {
            items: onOff(session.shuffleItems),
            options: onOff(session.shuffleOptions),
          })}
        </Row>
        <Row label={t('session.overview.showScoringRules')}>{yes(session.showScoringRules)}</Row>
        <Row label={t('session.overview.accessCode')}>
          <span className="inline-flex flex-wrap items-center gap-3">
            <span data-testid="access-code" className="font-mono text-xl tracking-widest">
              {session.accessCode}
            </span>
            <Button onClick={copyCode}>{t('session.action.copy')}</Button>
          </span>
        </Row>
        <Row label={t('session.overview.roster')}>
          {t('session.roster.count', { count: session.rosterCount })}
        </Row>
        {session.cancelledAt && (
          <Row label={t('session.overview.cancelledAt')}>{formatDateTime(session.cancelledAt)}</Row>
        )}
        {session.cancelReason && (
          <Row label={t('session.overview.cancelReason')}>{session.cancelReason}</Row>
        )}
      </dl>
    </Card>
  );
}

/** Sửa theo trạng thái (Q202): ô bị khóa vẫn hiện, kèm lý do; lưu kèm `version`. */
function EditForm({ session, onDone }: { session: SessionSummary; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const rules = sessionEditableFields(session.phase);
  const [draft, setDraft] = useState<SessionDraft>(() => draftOf(session));
  const patch = (change: Partial<SessionDraft>) => setDraft((d) => ({ ...d, ...change }));
  const invalid = invalidFields(draft);

  const save = useMutation({
    mutationFn: () => {
      const input = inputOf(draft);
      // Ô bị khóa gửi đúng giá trị server đang giữ, để việc làm tròn giờ về phút không bị coi là một thay đổi.
      const locked: Partial<typeof input> = {};
      for (const field of [
        'examId',
        'title',
        'opensAt',
        'closesAt',
        'durationMinutes',
        'hardClose',
        'maxAttempts',
        'attemptScoring',
        'shuffleItems',
        'shuffleOptions',
        'showScoringRules',
      ] as const) {
        if (rules[field] === undefined) Object.assign(locked, { [field]: session[field] });
      }
      return saveSession(session.id, { ...input, ...locked, version: session.version });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast(t('session.action.saved'));
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-6">
        <SessionFields
          group="exam"
          draft={draft}
          patch={patch}
          rules={rules}
          currentExam={{ id: session.examId, title: session.examTitle }}
          invalid={invalid}
        />
        <SessionFields group="times" draft={draft} patch={patch} rules={rules} invalid={invalid} />
        <SessionFields group="rules" draft={draft} patch={patch} rules={rules} invalid={invalid} />
      </Card>
      <ErrorMessage>{save.isError && errorMessage(t, save.error)}</ErrorMessage>
      <StickyActionBar align="end">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onDone}>{t('session.action.editCancel')}</Button>
          <PrimaryButton
            disabled={invalid.size > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            {t('session.action.save')}
          </PrimaryButton>
        </div>
      </StickyActionBar>
    </div>
  );
}
