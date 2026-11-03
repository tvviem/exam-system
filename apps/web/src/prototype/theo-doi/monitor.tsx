// PROTOTYPE (Q207, Q252–Q254): màn Theo dõi gộp. Ba chế độ xem theo mật độ, bộ lọc "Cần chú ý", chọn nhóm,
// thao tác cho một người, một nhóm hoặc cả phòng (mọi thao tác nặng đều qua hộp xác nhận nêu số người).
import { LayoutGrid, Pause, Play, Rows3, Table2, UserCheck } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Button, SearchField, SelectField } from '../../lib/ui';
import { Chip } from '../../lib/ui/chips';
import { PageHeader } from '../../lib/ui/page-header';
import { RowMenu } from '../../lib/ui/row-menu';
import { StickyActionBar } from '../../lib/ui/sticky-action-bar';
import { useToast } from '../../lib/ui/toast';
import {
  clock,
  DURATION_SECONDS,
  type Person,
  reasonsOf,
  SIM_STEP,
  TOTAL_QUESTIONS,
  useRoom,
} from './room';
import {
  ConfirmDialog,
  type Counts,
  countsOf,
  ExtendDialog,
  PersonPanel,
  SummaryBar,
} from './shared';
import { CardsView, GridView, TableView, type ViewProps } from './views';

export type View = 'cards' | 'table' | 'grid';

/** Q253: chế độ mặc định theo số người trong Danh sách dự thi. */
export const defaultViewFor = (count: number): View =>
  count <= 30 ? 'cards' : count <= 150 ? 'table' : 'grid';

const VIEWS: { key: View; label: string; icon: ReactNode }[] = [
  { key: 'cards', label: 'Thẻ', icon: <Rows3 aria-hidden className="size-4" /> },
  { key: 'table', label: 'Bảng', icon: <Table2 aria-hidden className="size-4" /> },
  { key: 'grid', label: 'Lưới', icon: <LayoutGrid aria-hidden className="size-4" /> },
];

const isLive = (p: Person) => p.state === 'working' || p.state === 'disconnected';

const MATCH: Record<keyof Counts | 'attention', (p: Person, simNow: number) => boolean> = {
  working: (p) => p.state === 'working',
  submitted: (p) => p.state === 'submitted',
  disconnected: (p) => p.state === 'disconnected',
  not_started: (p) => p.state === 'not_started',
  violations: (p) => p.warnings > 0 || p.state === 'suspended',
  attention: (p, simNow) => isLive(p) && reasonsOf(p, simNow).length > 0,
};

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();

type Dialog =
  | { kind: 'extend'; ids: number[]; scope: string }
  | { kind: 'force'; ids: number[]; scope: string }
  | { kind: 'suspend'; id: number }
  | { kind: 'entry' };

export function MonitorScreen({
  count,
  view,
  onView,
}: {
  count: number;
  view: View;
  onView: (view: View) => void;
}) {
  const toast = useToast();
  const room = useRoom(count);
  const { people, simNow, actions } = room;
  const [filter, setFilter] = useState<keyof Counts | 'attention' | null>(null);
  const [cls, setCls] = useState('');
  const [query, setQuery] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const counts = useMemo(() => countsOf(people), [people]);
  const attention = useMemo(
    () => people.filter((p) => MATCH.attention(p, simNow)).length,
    [people, simNow],
  );
  const classes = useMemo(() => [...new Set(people.map((p) => p.className))].sort(), [people]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return people.filter(
      (p) =>
        (!filter || MATCH[filter](p, simNow)) &&
        (!cls || p.className === cls) &&
        (!q || fold(`${p.name} ${p.code}`).includes(q)),
    );
  }, [people, filter, cls, query, simNow]);

  const liveIn = (ids: number[]) => {
    const set = new Set(ids);
    return people.filter((p) => set.has(p.id) && isLive(p)).length;
  };
  const allLive = people.filter(isLive).map((p) => p.id);
  const selectedIds = [...selected];

  const press = (id: number) =>
    selectMode
      ? setSelected((cur) => {
          const next = new Set(cur);
          if (!next.delete(id)) next.add(id);
          return next;
        })
      : setOpenId(id);
  const toggleAll = () =>
    setSelected((cur) =>
      shown.length > 0 && shown.every((p) => cur.has(p.id))
        ? new Set()
        : new Set(shown.map((p) => p.id)),
    );
  const leaveSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const viewProps: ViewProps = {
    people: shown,
    simNow,
    selected,
    selectMode,
    openId,
    onPress: press,
    onOpen: setOpenId,
    onExtend: (id) => setDialog({ kind: 'extend', ids: [id], scope: 'Một người' }),
    onToggleAll: toggleAll,
  };
  const person = people.find((p) => p.id === openId);
  const person1 = dialog?.kind === 'suspend' ? people.find((p) => p.id === dialog.id) : undefined;

  return (
    <div className={`flex flex-col gap-4 ${openId !== null ? 'lg:pr-96' : ''}`}>
      <PageHeader
        title="Theo dõi phòng thi"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[13px] font-medium text-fg-muted">
              Giờ phòng thi {clock(simNow)} / {clock(DURATION_SECONDS)}
            </span>
            <Button
              onClick={() => room.setPaused(!room.paused)}
              aria-label={room.paused ? 'Tiếp tục mô phỏng' : 'Tạm dừng mô phỏng'}
            >
              {room.paused ? (
                <Play aria-hidden className="size-4" />
              ) : (
                <Pause aria-hidden className="size-4" />
              )}
              <span className="hidden sm:inline">{room.paused ? 'Tiếp tục' : 'Tạm dừng'}</span>
            </Button>
            <RowMenu
              label="Thao tác cả phòng"
              items={[
                {
                  label: 'Cộng giờ cả phòng…',
                  onSelect: () => setDialog({ kind: 'extend', ids: allLive, scope: 'Cả phòng' }),
                },
                {
                  label: room.entryClosed ? 'Mở lại cửa vào thi…' : 'Đóng cửa vào thi…',
                  onSelect: () => setDialog({ kind: 'entry' }),
                },
                {
                  label: 'Buộc nộp cả phòng…',
                  danger: true,
                  onSelect: () => setDialog({ kind: 'force', ids: allLive, scope: 'Cả phòng' }),
                },
              ]}
            />
          </div>
        }
      />

      <SummaryBar
        counts={counts}
        total={people.length}
        active={filter === 'attention' ? null : filter}
        onPick={(key) => setFilter((cur) => (cur === key ? null : key))}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="basis-full sm:min-w-56 sm:flex-1 sm:basis-0">
          <SearchField
            id="monitor-search"
            label="Tìm người dự thi"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-32 sm:w-40">
          <SelectField
            id="monitor-class"
            label="Lớp"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          >
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
        <fieldset className="m-0 inline-flex rounded-lg border border-border-strong bg-surface p-0.5">
          <legend className="sr-only">Chế độ xem</legend>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              aria-label={v.label}
              onClick={() => onView(v.key)}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-semibold pointer-fine:min-h-8 ${
                view === v.key ? 'bg-primary text-on-primary' : 'text-fg hover:bg-primary-soft'
              }`}
            >
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </fieldset>
        <Button
          aria-pressed={selectMode}
          aria-label={selectMode ? 'Xong chọn' : 'Chọn nhiều'}
          onClick={() => (selectMode ? leaveSelect() : setSelectMode(true))}
        >
          <UserCheck aria-hidden className="size-4" />
          <span className="sm:hidden">{selectMode ? 'Xong' : 'Chọn'}</span>
          <span className="hidden sm:inline">{selectMode ? 'Xong chọn' : 'Chọn nhiều'}</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip
          active={filter === 'attention'}
          count={attention}
          onClick={() => setFilter((c) => (c === 'attention' ? null : 'attention'))}
        >
          Cần chú ý
        </Chip>
        {(filter || cls || query) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFilter(null);
              setCls('');
              setQuery('');
            }}
          >
            Bỏ lọc
          </Button>
        )}
        <span className="text-sm text-fg-muted" aria-live="polite">
          {shown.length} / {people.length} người
        </span>
      </div>

      <ProgressDistribution people={people} />

      {shown.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-fg-muted">
          Không có ai khớp bộ lọc.
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
            Đã chọn <strong>{selected.size}</strong> người, trong đó{' '}
            <strong>{liveIn(selectedIds)}</strong> đang làm
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={toggleAll}>
              {shown.length > 0 && shown.every((p) => selected.has(p.id))
                ? 'Bỏ chọn'
                : `Chọn cả ${shown.length} người đang hiện`}
            </Button>
            <Button
              variant="primary"
              disabled={liveIn(selectedIds) === 0}
              onClick={() => setDialog({ kind: 'extend', ids: selectedIds, scope: 'Nhóm đã chọn' })}
            >
              Cộng giờ…
            </Button>
            <Button
              variant="danger"
              disabled={liveIn(selectedIds) === 0}
              onClick={() => setDialog({ kind: 'force', ids: selectedIds, scope: 'Nhóm đã chọn' })}
            >
              Buộc nộp…
            </Button>
          </div>
        </StickyActionBar>
      )}

      <PersonPanel
        person={person}
        simNow={simNow}
        onClose={() => setOpenId(null)}
        handlers={{
          actions,
          onExtend: (id) => setDialog({ kind: 'extend', ids: [id], scope: 'Một người' }),
          onForce: (id) => setDialog({ kind: 'force', ids: [id], scope: 'Một người' }),
          onSuspend: (id) => setDialog({ kind: 'suspend', id }),
        }}
      />

      {dialog?.kind === 'extend' && (
        <ExtendDialog
          count={liveIn(dialog.ids)}
          scope={dialog.scope}
          onClose={() => setDialog(null)}
          onConfirm={(minutes) => {
            actions.extend(dialog.ids, minutes);
            toast(`Đã cộng ${minutes} phút cho ${liveIn(dialog.ids)} người (giả lập)`);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'force' && (
        <ConfirmDialog
          title="Buộc nộp"
          danger
          confirmLabel={`Buộc nộp ${liveIn(dialog.ids)} người`}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            actions.forceSubmit(dialog.ids);
            toast(`Đã Buộc nộp ${liveIn(dialog.ids)} người (giả lập)`);
            setDialog(null);
            if (dialog.scope === 'Nhóm đã chọn') leaveSelect();
          }}
        >
          {dialog.scope}: <strong className="text-fg">{liveIn(dialog.ids)} người</strong> đang làm
          sẽ nộp bài ngay. Các câu đã lưu được giữ và chấm như bình thường. Không hoàn tác được.
        </ConfirmDialog>
      )}
      {dialog?.kind === 'suspend' && person1 && (
        <ConfirmDialog
          title="Đình chỉ"
          danger
          confirmLabel="Đình chỉ"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            actions.suspend(person1.id);
            toast(`Đã Đình chỉ ${person1.name} (giả lập)`);
            setDialog(null);
          }}
        >
          Dừng ngay bài của <strong className="text-fg">{person1.name}</strong> và ghi Vi phạm. Đình
          chỉ chỉ áp dụng cho từng người.
        </ConfirmDialog>
      )}
      {dialog?.kind === 'entry' && (
        <ConfirmDialog
          title={room.entryClosed ? 'Mở lại cửa vào thi' : 'Đóng cửa vào thi'}
          confirmLabel={room.entryClosed ? 'Mở lại' : 'Đóng cửa'}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            room.setEntryClosed(!room.entryClosed);
            toast(
              room.entryClosed
                ? 'Đã mở lại cửa vào thi (giả lập)'
                : 'Đã đóng cửa vào thi (giả lập)',
            );
            setDialog(null);
          }}
        >
          {room.entryClosed
            ? 'Người chưa vào sẽ vào được trở lại.'
            : `Từ giờ không ai mới vào được. ${counts.not_started} người chưa vào sẽ không thi được; người đang làm không bị ảnh hưởng.`}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Phân bố tiến độ (từ phương án C): người ở cột thấp trong khi thời gian đã trôi nhiều là người "im lặng". */
function ProgressDistribution({ people }: { people: Person[] }) {
  const buckets = useMemo(() => {
    const out = Array.from({ length: 8 }, (_, i) => ({ from: i * 5, n: 0 }));
    for (const p of people) {
      if (isLive(p)) {
        const b = out[Math.min(7, Math.floor((p.answered / TOTAL_QUESTIONS) * 8))];
        if (b) b.n++;
      }
    }
    return out;
  }, [people]);
  const peak = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">
        Phân bố tiến độ của người đang làm
      </summary>
      <div
        className="flex h-28 items-end gap-1 px-4 pb-3"
        role="img"
        aria-label="Phân bố số câu đã làm, mỗi cột 5 câu"
      >
        {buckets.map(({ from, n }) => (
          <div key={from} className="flex flex-1 flex-col items-center justify-end gap-0.5">
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

export const STEP_NOTE = `1 nhịp 2 giây = ${SIM_STEP} giây trong phòng thi`;
