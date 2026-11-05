import { REALTIME_EVENT, REALTIME_JOIN } from '@exam/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ListFilter, Radio, Rows3, Table2, Undo2, UserCheck } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import { undoUntilOfEarliest } from '../../force-confirm';
import { type MonitorSnapshot, monitorQuery, monitorQueryKey } from '../../monitor';
import {
  countsOf,
  defaultViewFor,
  type FilterKey,
  foldText,
  isLive,
  type MonitorView,
  matchesFilter,
} from '../../monitor-view';
import { realtime } from '../../realtime';
import { Button, Dialog, ErrorMessage, SearchField, SelectField } from '..';
import { ListSkeleton } from '../admin';
import { Chip } from '../chips';
import { RowMenu } from '../row-menu';
import { StickyActionBar } from '../sticky-action-bar';
import { type DialogState, MonitorDialogs } from './dialogs-host';
import { PersonPanel } from './panel';
import { clockText, SnapshotClock, SummaryBar, useMedia, useUndoLeft } from './parts';
import { useMonitorActions } from './use-actions';
import { CardsView, GridView, TableView, type ViewProps } from './views';

const VIEWS: { key: MonitorView; icon: ReactNode }[] = [
  { key: 'cards', icon: <Rows3 aria-hidden className="size-4" /> },
  { key: 'table', icon: <Table2 aria-hidden className="size-4" /> },
  { key: 'grid', icon: <LayoutGrid aria-hidden className="size-4" /> },
];

/** Bảng và Thẻ vẽ từng dòng nên chỉ vẽ từng đợt chừng này người (Q253); Lưới vẽ cả phòng vì ô nhẹ. */
const PAGE_SIZE = 100;

/**
 * Màn Theo dõi của Người ra đề (Q252–Q254): trạng thái cả phòng ở ba chế độ xem theo mật độ, bộ lọc Cần chú ý, chọn một
 * người, một nhóm hoặc cả phòng để Cộng giờ và Buộc nộp. Cập nhật bằng cách hỏi lại mỗi 5 giây (Socket.IO ở 4d-3).
 */
export function MonitorScreen({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const snapshot = useQuery(monitorQuery(sessionId, live));

  // Kênh đẩy (PR 4d-3): nhận `monitor.changed` thì tải lại ngay; nối lại sau khi đứt thì tải lại để bù tin đã lỡ.
  useEffect(() => {
    const reload = () =>
      void queryClient.invalidateQueries({ queryKey: monitorQueryKey(sessionId) });
    let connectedBefore = false;
    const stop = realtime.subscribe({
      join: REALTIME_JOIN.monitor,
      payload: { sessionId },
      event: REALTIME_EVENT.monitorChanged,
      onEvent: reload,
      onConnected: () => {
        if (connectedBefore) reload(); // lần nối đầu đã có ảnh chụp mới tải
        connectedBefore = true;
      },
      onLive: setLive,
    });
    return () => {
      stop();
      setLive(false);
    };
  }, [sessionId, queryClient]);

  if (snapshot.isPending) return <ListSkeleton rows={4} />;
  if (!snapshot.data) return <ErrorMessage>{errorMessage(t, snapshot.error)}</ErrorMessage>;
  return (
    <MonitorBody
      sessionId={sessionId}
      data={snapshot.data}
      offline={snapshot.isError}
      live={live}
    />
  );
}

function MonitorBody({
  sessionId,
  data,
  offline,
  live,
}: {
  sessionId: string;
  data: MonitorSnapshot;
  offline: boolean;
  live: boolean;
}) {
  const { t } = useTranslation();
  const { people, totalItems } = data;
  const clock = useMemo(
    () => ({ serverNow: data.serverNow, receivedAt: performance.now() }),
    [data],
  );
  const [view, setView] = useState<MonitorView>(() => defaultViewFor(people.length));
  const [filter, setFilter] = useState<FilterKey | null>(null);
  const [cls, setCls] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
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
  // Đổi bộ lọc thì quay về đợt đầu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi bộ lọc đổi
  useEffect(() => setLimit(PAGE_SIZE), [filter, cls, query, view]);
  const visible = view === 'grid' ? shown : shown.slice(0, limit);
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);

  /** Mã Lượt đang làm của những người được chọn: chỉ họ mới Cộng giờ hay Buộc nộp được. */
  const liveAttempts = (userIds: string[]) =>
    userIds.flatMap((id) => {
      const person = byId.get(id);
      return person && isLive(person) && person.attemptId ? [person.attemptId] : [];
    });
  const allLive = people.filter(isLive);
  /** Người vừa bị Buộc nộp và còn Hoàn tác được (Q278). */
  const undoable = people.filter((p) => p.undoUntil !== null);

  const leaveSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const actions = useMonitorActions({
    sessionId,
    byId,
    entryClosed: data.entryClosed,
    onDone: () => setDialog(null),
    onGroupForced: leaveSelect,
  });

  const extendOne = (userId: string) => setDialog({ kind: 'extend', ids: [userId], scope: 'one' });
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

  const viewProps: ViewProps = {
    people: visible,
    totalItems,
    selected,
    selectMode,
    openId,
    onPress: press,
    onOpen: setOpenId,
    onExtend: extendOne,
    onToggleAll: toggleAll,
  };
  const person = openId ? byId.get(openId) : undefined;
  const selectedIds = [...selected];
  const hasFilters = !!(filter || cls || query);

  const searchField = (
    <SearchField
      id="monitor-search"
      label={t('monitor.search')}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
  const classField = (
    <SelectField
      id="monitor-class"
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
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{t('monitor.title')}</h2>
            {/* Chữ kèm biểu tượng, không chỉ màu: Người ra đề biết số liệu đến tức thì hay đang hỏi lại 5 giây một lần. */}
            <span
              className={`inline-flex items-center gap-1 text-[13px] ${live ? 'text-success' : 'text-fg-muted'}`}
              aria-live="polite"
            >
              <Radio aria-hidden className="size-3.5" />
              {t(live ? 'monitor.live' : 'monitor.polling')}
            </span>
          </div>
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
                label: t('monitor.action.undoAll', { count: undoable.length }),
                disabled: undoable.length === 0,
                onSelect: () => setDialog({ kind: 'undo', ids: undoable.map((p) => p.userId) }),
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

        {undoable.length > 0 && (
          <UndoBar
            count={undoable.length}
            until={undoUntilOfEarliest(undoable)}
            onUndo={() => setDialog({ kind: 'undo', ids: undoable.map((p) => p.userId) })}
          />
        )}

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

        {visible.length < shown.length && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-sm text-fg-muted">
              {t('monitor.showing', { shown: visible.length, total: shown.length })}
            </span>
            <Button onClick={() => setLimit((current) => current + PAGE_SIZE)}>
              {t('monitor.more', { count: Math.min(PAGE_SIZE, shown.length - visible.length) })}
            </Button>
          </div>
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
          closeOnEscape={dialog === null}
          onClose={() => setOpenId(null)}
          handlers={{
            onExtend: extendOne,
            onForce: (userId) => setDialog({ kind: 'force', ids: [userId], scope: 'one' }),
            onUndo: (userId) => setDialog({ kind: 'undo', ids: [userId] }),
            onRevoke: (userId) => setDialog({ kind: 'revoke', userId }),
            onPardon: (userId) => setDialog({ kind: 'pardon', userId }),
            onWarn: (userId) => setDialog({ kind: 'warn', userId }),
            onSuspend: (userId) => setDialog({ kind: 'suspend', userId }),
          }}
        />

        <MonitorDialogs
          dialog={dialog}
          actions={actions}
          byId={byId}
          liveAttempts={liveAttempts}
          totalItems={totalItems}
          entryClosed={data.entryClosed}
          notStarted={counts.not_started}
          onClose={() => setDialog(null)}
        />

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

/** Dải nhắc ngay trên màn Theo dõi khi có người vừa bị Buộc nộp: còn bao lâu để mở lại bài (Q278). */
function UndoBar({
  count,
  until,
  onUndo,
}: {
  count: number;
  until: string | null;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const left = useUndoLeft(until);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning bg-warning-soft p-3 text-sm"
    >
      <p>
        <Undo2 aria-hidden className="mr-1 inline size-4 align-[-3px]" />
        {t('monitor.undo.barText', { count })}{' '}
        {left !== null && t('monitor.undo.barLeft', { time: clockText(left) })}
      </p>
      <Button variant="primary" onClick={onUndo}>
        {t('monitor.action.undoAll', { count })}
      </Button>
    </div>
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
  // Nhãn đọc được phải mang đủ số liệu của từng cột, không chỉ tên biểu đồ.
  const summary = buckets.map((b) => `${t('monitor.bucket', { from: b.from })}: ${b.n}`).join('; ');
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">
        {t('monitor.distribution.title')}
      </summary>
      <div
        className="flex h-28 items-end gap-1 px-4 pb-3"
        role="img"
        aria-label={t('monitor.distribution.label', { buckets: summary })}
      >
        {buckets.map(({ id, from, n }) => (
          <div key={id} className="flex flex-1 flex-col items-center justify-end gap-0.5">
            <span className="text-[13px] tabular-nums text-fg-muted">{n}</span>
            <span
              className="w-full rounded-t bg-primary"
              style={{ height: `${(n / peak) * 100}%`, minHeight: 2 }}
            />
            <span className="text-[13px] text-fg-muted">{t('monitor.bucket', { from })}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
