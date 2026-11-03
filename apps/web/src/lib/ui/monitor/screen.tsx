import { VIOLATION_REASON_MAX } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ListFilter, Rows3, Table2, UserCheck } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import {
  extendTime,
  forceSubmit,
  type MonitorSnapshot,
  monitorQuery,
  monitorQueryKey,
  pardonDevice,
  recordViolation,
  revokeDevice,
  setEntryClosed,
} from '../../monitor';
import {
  countsOf,
  defaultViewFor,
  type FilterKey,
  foldText,
  isLive,
  type MonitorView,
  matchesFilter,
} from '../../monitor-view';
import { Button, Dialog, ErrorMessage, SearchField, SelectField } from '..';
import { ListSkeleton } from '../admin';
import { Chip } from '../chips';
import { RowMenu } from '../row-menu';
import { StickyActionBar } from '../sticky-action-bar';
import { useToast } from '../toast';
import { ConfirmDialog, ExtendDialog, ReasonDialog } from './dialogs';
import { PersonPanel } from './panel';
import { SnapshotClock, SummaryBar, useMedia } from './parts';
import { CardsView, GridView, TableView, type ViewProps } from './views';

type Scope = 'one' | 'group' | 'all';
type DialogState =
  | { kind: 'extend'; ids: string[]; scope: Scope }
  | { kind: 'force'; ids: string[]; scope: Scope }
  | { kind: 'revoke' | 'pardon' | 'warn' | 'suspend'; userId: string }
  | { kind: 'entry' };

const VIEWS: { key: MonitorView; icon: ReactNode }[] = [
  { key: 'cards', icon: <Rows3 aria-hidden className="size-4" /> },
  { key: 'table', icon: <Table2 aria-hidden className="size-4" /> },
  { key: 'grid', icon: <LayoutGrid aria-hidden className="size-4" /> },
];

/**
 * Màn Theo dõi của Người ra đề (Q252–Q254): trạng thái cả phòng ở ba chế độ xem theo mật độ, bộ lọc Cần chú ý, chọn một
 * người, một nhóm hoặc cả phòng để Cộng giờ và Buộc nộp. Cập nhật bằng cách hỏi lại mỗi 5 giây (Socket.IO ở 4d-3).
 */
export function MonitorScreen({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const snapshot = useQuery(monitorQuery(sessionId));
  if (snapshot.isPending) return <ListSkeleton rows={4} />;
  if (!snapshot.data) return <ErrorMessage>{errorMessage(t, snapshot.error)}</ErrorMessage>;
  return <MonitorBody sessionId={sessionId} data={snapshot.data} offline={snapshot.isError} />;
}

const fieldsId = (name: string) => `monitor-${name}`;

function MonitorBody({
  sessionId,
  data,
  offline,
}: {
  sessionId: string;
  data: MonitorSnapshot;
  offline: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { people, totalItems } = data;
  const clock = useMemo(
    () => ({ serverNow: data.serverNow, receivedAt: performance.now() }),
    [data],
  );
  const [view, setView] = useState<MonitorView>(() => defaultViewFor(people.length));
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [cls, setCls] = useState('');
  const [query, setQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const wide = useMedia('(min-width: 640px)');

  const counts = useMemo(() => countsOf(people), [people]);
  const attention = useMemo(
    () => people.filter((p) => matchesFilter(p, 'attention')).length,
    [people],
  );
  const classes = useMemo(
    () =>
      [...new Set(people.map((p) => p.classLabel).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b, 'vi'),
      ),
    [people],
  );
  const shown = useMemo(() => {
    const q = foldText(query.trim());
    return people.filter(
      (p) =>
        (!filter || matchesFilter(p, filter)) &&
        (!cls || p.classLabel === cls) &&
        (!q || foldText(`${p.fullName} ${p.code ?? ''}`).includes(q)),
    );
  }, [people, filter, cls, query]);
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);

  /** Mã Lượt đang làm của những người được chọn: chỉ họ mới Cộng giờ hay Buộc nộp được. */
  const liveAttempts = (userIds: string[]) =>
    userIds.flatMap((id) => {
      const person = byId.get(id);
      return person && isLive(person) && person.attemptId ? [person.attemptId] : [];
    });
  const allLive = people.filter(isLive);

  const refresh = () => queryClient.invalidateQueries({ queryKey: monitorQueryKey(sessionId) });
  const fail = (error: unknown) => toast(errorMessage(t, error), 'error');
  const done = (message: string) => {
    toast(message);
    setDialog(null);
    void refresh();
  };

  const extend = useMutation({
    mutationFn: (input: {
      ids: string[];
      scope: Scope;
      minutes: number;
      reason: string;
      batchId: string;
    }) =>
      extendTime(sessionId, {
        ...(input.scope === 'all' ? { scope: 'all' as const } : { attemptIds: input.ids }),
        minutes: input.minutes,
        reason: input.reason,
        batchId: input.batchId,
      }),
    onSuccess: (result, input) =>
      done(t('monitor.toast.extended', { minutes: input.minutes, count: result.extended })),
    onError: fail,
  });
  const force = useMutation({
    mutationFn: (input: { ids: string[]; scope: Scope }) =>
      forceSubmit(sessionId, input.scope === 'all' ? { scope: 'all' } : { attemptIds: input.ids }),
    onSuccess: (result, input) => {
      done(t('monitor.toast.forced', { count: result.closed }));
      if (input.scope === 'group') leaveSelect();
    },
    onError: fail,
  });
  const violation = useMutation({
    mutationFn: (input: { person: string; action: 'warning' | 'disqualify'; reason: string }) => {
      const attemptId = byId.get(input.person)?.attemptId;
      if (!attemptId) throw new Error('no attempt');
      return recordViolation(sessionId, attemptId, { action: input.action, reason: input.reason });
    },
    onSuccess: (_result, input) =>
      done(t(input.action === 'warning' ? 'monitor.toast.warned' : 'monitor.toast.suspended')),
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      revokeDevice(sessionId, input.userId, input.reason),
    onSuccess: () => done(t('monitor.toast.revoked')),
    onError: fail,
  });
  const pardon = useMutation({
    mutationFn: (userId: string) => {
      const deviceId = byId.get(userId)?.revokedDeviceId;
      if (!deviceId) throw new Error('no device');
      return pardonDevice(sessionId, userId, deviceId);
    },
    onSuccess: () => done(t('monitor.toast.pardoned')),
    onError: fail,
  });
  const entry = useMutation({
    mutationFn: () => setEntryClosed(sessionId, !data.entryClosed),
    onSuccess: () => done(t(data.entryClosed ? 'monitor.toast.reopened' : 'monitor.toast.closed')),
    onError: fail,
  });

  const press = (userId: string) =>
    selectMode
      ? setSelected((current) => {
          const next = new Set(current);
          if (!next.delete(userId)) next.add(userId);
          return next;
        })
      : setOpenId(userId);
  const allShownPicked = shown.length > 0 && shown.every((p) => selected.has(p.userId));
  const toggleAll = () =>
    setSelected(allShownPicked ? new Set() : new Set(shown.map((p) => p.userId)));
  function leaveSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const viewProps: ViewProps = {
    people: shown,
    totalItems,
    selected,
    selectMode,
    openId,
    onPress: press,
    onOpen: setOpenId,
    onExtend: (userId) => setDialog({ kind: 'extend', ids: [userId], scope: 'one' }),
    onToggleAll: toggleAll,
  };
  const person = openId ? byId.get(openId) : undefined;
  const target = dialog && 'userId' in dialog ? byId.get(dialog.userId) : undefined;
  const selectedIds = [...selected];
  const scopeLabel = (scope: Scope) => t(`monitor.scope.${scope}`);
  const hasFilters = !!(filter || cls || query);

  const searchField = (
    <SearchField
      id={fieldsId('search')}
      label={t('monitor.search')}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
  const classField = (
    <SelectField
      id={fieldsId('class')}
      label={t('monitor.class')}
      value={cls}
      onChange={(e) => setCls(e.target.value)}
    >
      <option value="">{t('monitor.allClasses')}</option>
      {classes.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </SelectField>
  );

  return (
    <SnapshotClock.Provider value={clock}>
      <div className={`flex flex-col gap-4 ${openId !== null ? 'lg:pr-96' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('monitor.title')}</h2>
          <RowMenu
            label={t('monitor.roomActions')}
            items={[
              {
                label: t('monitor.action.extendRoom'),
                disabled: allLive.length === 0,
                onSelect: () =>
                  setDialog({ kind: 'extend', ids: allLive.map((p) => p.userId), scope: 'all' }),
              },
              {
                label: t(
                  data.entryClosed ? 'monitor.action.reopenEntry' : 'monitor.action.closeEntry',
                ),
                onSelect: () => setDialog({ kind: 'entry' }),
              },
              {
                label: t('monitor.action.forceRoom'),
                danger: true,
                disabled: allLive.length === 0,
                onSelect: () =>
                  setDialog({ kind: 'force', ids: allLive.map((p) => p.userId), scope: 'all' }),
              },
            ]}
          />
        </div>

        {offline && <ErrorMessage>{t('monitor.stale')}</ErrorMessage>}

        <SummaryBar
          counts={counts}
          total={people.length}
          active={filter === 'attention' ? null : filter}
          onPick={(key) => setFilter((current) => (current === key ? null : key))}
        />

        <div className="flex flex-wrap items-end gap-3">
          {wide ? (
            <>
              <div className="basis-full sm:min-w-56 sm:flex-1 sm:basis-0">{searchField}</div>
              <div className="w-40">{classField}</div>
            </>
          ) : (
            <Button onClick={() => setFiltersOpen(true)} aria-label={t('monitor.filters')}>
              <ListFilter aria-hidden className="size-4" />
              {t('monitor.filters')}
              {(cls || query) && (
                <span className="tabular-nums">({[cls, query].filter(Boolean).length})</span>
              )}
            </Button>
          )}
          <fieldset className="m-0 inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
            <legend className="sr-only">{t('monitor.view.label')}</legend>
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={view === v.key}
                aria-label={t(`monitor.view.${v.key}`)}
                onClick={() => setView(v.key)}
                className={`inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-semibold pointer-fine:min-h-8 ${
                  view === v.key ? 'bg-primary text-on-primary' : 'text-fg hover:bg-primary-soft'
                }`}
              >
                {v.icon}
                <span className="hidden sm:inline">{t(`monitor.view.${v.key}`)}</span>
              </button>
            ))}
          </fieldset>
          <Button
            aria-pressed={selectMode}
            aria-label={t(selectMode ? 'monitor.select.done' : 'monitor.select.start')}
            onClick={() => (selectMode ? leaveSelect() : setSelectMode(true))}
          >
            <UserCheck aria-hidden className="size-4" />
            <span className="sm:hidden">
              {t(selectMode ? 'monitor.select.doneShort' : 'monitor.select.startShort')}
            </span>
            <span className="hidden sm:inline">
              {t(selectMode ? 'monitor.select.done' : 'monitor.select.start')}
            </span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={filter === 'attention'}
            count={attention}
            onClick={() => setFilter((current) => (current === 'attention' ? null : 'attention'))}
          >
            {t('monitor.attention')}
          </Chip>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilter(null);
                setCls('');
                setQuery('');
              }}
            >
              {t('monitor.clearFilters')}
            </Button>
          )}
          <span className="text-sm text-fg-muted" aria-live="polite">
            {t('monitor.shown', { shown: shown.length, total: people.length })}
          </span>
        </div>

        <ProgressDistribution people={people.filter(isLive)} totalItems={totalItems} />

        {shown.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-fg-muted">
            {t(people.length === 0 ? 'monitor.emptyRoster' : 'monitor.emptyFilter')}
          </p>
        ) : view === 'cards' ? (
          <CardsView {...viewProps} />
        ) : view === 'table' ? (
          <TableView {...viewProps} />
        ) : (
          <GridView {...viewProps} />
        )}

        {selectMode && (
          <StickyActionBar>
            <p className="text-sm" aria-live="polite">
              {t('monitor.select.summary', {
                count: selected.size,
                live: liveAttempts(selectedIds).length,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={toggleAll}>
                {allShownPicked
                  ? t('monitor.select.none')
                  : t('monitor.select.allShown', { count: shown.length })}
              </Button>
              <Button
                variant="primary"
                disabled={liveAttempts(selectedIds).length === 0}
                onClick={() => setDialog({ kind: 'extend', ids: selectedIds, scope: 'group' })}
              >
                {t('monitor.action.extend')}
              </Button>
              <Button
                variant="danger"
                disabled={liveAttempts(selectedIds).length === 0}
                onClick={() => setDialog({ kind: 'force', ids: selectedIds, scope: 'group' })}
              >
                {t('monitor.action.force')}
              </Button>
            </div>
          </StickyActionBar>
        )}

        <PersonPanel
          person={person}
          totalItems={totalItems}
          onClose={() => setOpenId(null)}
          handlers={{
            onExtend: (userId) => setDialog({ kind: 'extend', ids: [userId], scope: 'one' }),
            onForce: (userId) => setDialog({ kind: 'force', ids: [userId], scope: 'one' }),
            onRevoke: (userId) => setDialog({ kind: 'revoke', userId }),
            onPardon: (userId) => setDialog({ kind: 'pardon', userId }),
            onWarn: (userId) => setDialog({ kind: 'warn', userId }),
            onSuspend: (userId) => setDialog({ kind: 'suspend', userId }),
          }}
        />

        {dialog?.kind === 'extend' && (
          <ExtendDialog
            count={liveAttempts(dialog.ids).length}
            scope={scopeLabel(dialog.scope)}
            busy={extend.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(input) =>
              extend.mutate({ ids: liveAttempts(dialog.ids), scope: dialog.scope, ...input })
            }
          />
        )}
        {dialog?.kind === 'force' && (
          <ConfirmDialog
            title={t('monitor.force.title')}
            danger
            busy={force.isPending}
            confirmLabel={t('monitor.force.confirm', { count: liveAttempts(dialog.ids).length })}
            onClose={() => setDialog(null)}
            onConfirm={() => force.mutate({ ids: liveAttempts(dialog.ids), scope: dialog.scope })}
          >
            {scopeLabel(dialog.scope)}:{' '}
            <strong className="text-fg">
              {t('monitor.people', { count: liveAttempts(dialog.ids).length })}
            </strong>{' '}
            {t('monitor.force.body')}
          </ConfirmDialog>
        )}
        {dialog?.kind === 'warn' && target && (
          <ReasonDialog
            title={t('monitor.warn.title')}
            body={t('monitor.warn.body', { name: target.fullName })}
            confirmLabel={t('monitor.warn.confirm')}
            required
            maxLength={VIOLATION_REASON_MAX}
            busy={violation.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(reason) =>
              violation.mutate({ person: target.userId, action: 'warning', reason })
            }
          />
        )}
        {dialog?.kind === 'suspend' && target && (
          <ReasonDialog
            title={t('monitor.suspend.title')}
            body={t('monitor.suspend.body', { name: target.fullName })}
            confirmLabel={t('monitor.suspend.confirm')}
            danger
            required
            maxLength={VIOLATION_REASON_MAX}
            busy={violation.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(reason) =>
              violation.mutate({ person: target.userId, action: 'disqualify', reason })
            }
          />
        )}
        {dialog?.kind === 'revoke' && target && (
          <ReasonDialog
            title={t('monitor.revoke.title')}
            body={t('monitor.revoke.body', { name: target.fullName })}
            confirmLabel={t('monitor.revoke.confirm')}
            danger
            required={false}
            maxLength={500}
            busy={revoke.isPending}
            onClose={() => setDialog(null)}
            onConfirm={(reason) => revoke.mutate({ userId: target.userId, reason })}
          />
        )}
        {dialog?.kind === 'pardon' && target && (
          <ConfirmDialog
            title={t('monitor.pardon.title')}
            busy={pardon.isPending}
            confirmLabel={t('monitor.pardon.confirm')}
            onClose={() => setDialog(null)}
            onConfirm={() => pardon.mutate(target.userId)}
          >
            {t('monitor.pardon.body', { name: target.fullName })}
          </ConfirmDialog>
        )}
        {dialog?.kind === 'entry' && (
          <ConfirmDialog
            title={t(data.entryClosed ? 'monitor.entry.reopenTitle' : 'monitor.entry.closeTitle')}
            busy={entry.isPending}
            confirmLabel={t(data.entryClosed ? 'monitor.entry.reopen' : 'monitor.entry.close')}
            onClose={() => setDialog(null)}
            onConfirm={() => entry.mutate()}
          >
            {data.entryClosed
              ? t('monitor.entry.reopenBody')
              : t('monitor.entry.closeBody', { count: counts.not_started })}
          </ConfirmDialog>
        )}

        <Dialog
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title={t('monitor.filters')}
        >
          {searchField}
          {classField}
          <Button variant="primary" onClick={() => setFiltersOpen(false)}>
            {t('common.done')}
          </Button>
        </Dialog>
      </div>
    </SnapshotClock.Provider>
  );
}

/** Phân bố tiến độ của người đang làm: người ở cột thấp khi thời gian đã trôi nhiều là người "im lặng". */
function ProgressDistribution({
  people,
  totalItems,
}: {
  people: MonitorSnapshot['people'];
  totalItems: number;
}) {
  const { t } = useTranslation();
  const buckets = useMemo(() => {
    const out = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      from: Math.round((i * totalItems) / 8),
      n: 0,
    }));
    for (const p of people) {
      const b = out[Math.min(7, Math.floor((p.answered / Math.max(1, totalItems)) * 8))];
      if (b) b.n++;
    }
    return out;
  }, [people, totalItems]);
  const peak = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">
        {t('monitor.distribution.title')}
      </summary>
      <div
        className="flex h-28 items-end gap-1 px-4 pb-3"
        role="img"
        aria-label={t('monitor.distribution.label')}
      >
        {buckets.map(({ id, from, n }) => (
          <div key={id} className="flex flex-1 flex-col items-center justify-end gap-0.5">
            <span className="text-[11px] tabular-nums text-fg-muted">{n}</span>
            <span
              className="w-full rounded-t bg-primary"
              style={{ height: `${(n / peak) * 100}%`, minHeight: 2 }}
            />
            <span className="text-[11px] text-fg-muted">{from}+</span>
          </div>
        ))}
      </div>
    </details>
  );
}
