// PROTOTYPE (Q207, Q253): ba chế độ xem của màn Theo dõi, lấy điểm mạnh từ ba phương án đầu.
//   Thẻ  (từ C): ít người, đủ chi tiết và lý do ngay trên thẻ, nút xử lý to.
//   Bảng (từ A): vài chục đến vài trăm người, hàng ổn định xếp theo tên gọi.
//   Lưới (từ B): đông người, cả phòng trong vài màn hình, ô tô dần theo tiến độ.
import { Ban, CircleCheck, Eye, ShieldOff, Smartphone, Turtle, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../lib/ui';
import { DataList } from '../../lib/ui/data-list';
import { type Person, reasonsOf, remainingOf, TOTAL_QUESTIONS } from './room';
import { ProgressBar, ReasonBadges, Remaining, STATE_META, StateBadge } from './shared';

export interface ViewProps {
  /** Đã qua bộ lọc và ô tìm. */
  people: Person[];
  simNow: number;
  selected: Set<number>;
  selectMode: boolean;
  openId: number | null;
  /** Chạm vào một người: chọn nếu đang ở chế độ chọn nhiều, ngược lại mở ngăn kéo. */
  onPress: (id: number) => void;
  onOpen: (id: number) => void;
  onExtend: (id: number) => void;
  onToggleAll: () => void;
}

function Check({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="-m-2 inline-flex size-12 shrink-0 cursor-pointer items-center justify-center pointer-fine:size-9">
      <input
        type="checkbox"
        className="size-5 accent-primary"
        aria-label={label}
        checked={checked}
        onChange={onChange}
      />
    </label>
  );
}

const isLive = (p: Person) => p.state === 'working' || p.state === 'disconnected';

// ---------------------------------------------------------------- Thẻ
export function CardsView({
  people,
  simNow,
  selected,
  selectMode,
  openId,
  onPress,
  onOpen,
  onExtend,
}: ViewProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {people.map((p) => (
        <li
          key={p.id}
          className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-sm ${
            selected.has(p.id) || openId === p.id
              ? 'border-primary ring-1 ring-primary'
              : 'border-border'
          }`}
        >
          <div className="flex items-start gap-3">
            {selectMode && (
              <Check
                checked={selected.has(p.id)}
                label={`Chọn ${p.name}`}
                onChange={() => onPress(p.id)}
              />
            )}
            <button
              type="button"
              onClick={() => onPress(p.id)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-fg-muted">
                {p.code} · {p.className}
              </p>
            </button>
            <Remaining person={p} simNow={simNow} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StateBadge state={p.state} />
            <ReasonBadges person={p} simNow={simNow} />
          </div>
          <ProgressBar value={p.answered} />
          {!selectMode && (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!isLive(p)} onClick={() => onExtend(p.id)}>
                Cộng giờ…
              </Button>
              <Button variant="primary" onClick={() => onOpen(p.id)}>
                Chi tiết
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- Bảng
export function TableView({
  people,
  simNow,
  selected,
  selectMode,
  openId,
  onPress,
  onToggleAll,
}: ViewProps) {
  const nameCell = (p: Person) => (
    <button
      type="button"
      onClick={() => onPress(p.id)}
      className={`flex min-h-12 w-full cursor-pointer flex-col items-start justify-center text-left pointer-fine:min-h-9 ${
        openId === p.id ? 'font-semibold text-primary' : ''
      }`}
    >
      <span>{p.name}</span>
      <span className="text-xs text-fg-muted">
        {p.code} · {p.className}
      </span>
    </button>
  );
  const allSelected = people.length > 0 && people.every((p) => selected.has(p.id));
  return (
    <DataList
      items={people}
      rowKey={(p) => p.id}
      selectionHeader={
        selectMode ? (
          <Check checked={allSelected} label="Chọn tất cả người đang hiện" onChange={onToggleAll} />
        ) : undefined
      }
      selectionCell={
        selectMode
          ? (p) => (
              <Check
                checked={selected.has(p.id)}
                label={`Chọn ${p.name}`}
                onChange={() => onPress(p.id)}
              />
            )
          : undefined
      }
      columns={[
        { key: 'name', header: 'Họ tên', cell: nameCell },
        { key: 'state', header: 'Trạng thái', cell: (p) => <StateBadge state={p.state} /> },
        { key: 'answered', header: 'Đã trả lời', cell: (p) => <ProgressBar value={p.answered} /> },
        { key: 'left', header: 'Còn lại', cell: (p) => <Remaining person={p} simNow={simNow} /> },
        {
          key: 'signs',
          header: 'Dấu hiệu',
          from: 'lg',
          cell: (p) => (
            <span className="flex flex-wrap gap-1">
              <ReasonBadges person={p} simNow={simNow} />
            </span>
          ),
        },
      ]}
      card={(p) => (
        <div
          className={`flex items-start gap-2 rounded-xl border bg-surface px-4 py-2 ${
            selected.has(p.id) ? 'border-primary ring-1 ring-primary' : 'border-border'
          }`}
        >
          {selectMode && (
            <Check
              checked={selected.has(p.id)}
              label={`Chọn ${p.name}`}
              onChange={() => onPress(p.id)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              {nameCell(p)}
              <StateBadge state={p.state} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-sm">
              <ProgressBar value={p.answered} />
              <Remaining person={p} simNow={simNow} />
            </div>
            <div className="flex flex-wrap gap-1 pb-1 empty:hidden">
              <ReasonBadges person={p} simNow={simNow} />
            </div>
          </div>
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------- Lưới
const initials = (p: Person) =>
  p.name
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('');

const SEAT_LOOK: Record<Person['state'], string> = {
  working: 'border-primary text-fg',
  submitted: 'border-success bg-success-soft text-success',
  disconnected: 'border-warning bg-warning-soft text-warning',
  suspended: 'border-danger bg-danger-soft text-danger',
  not_started: 'border-dashed border-border-strong text-fg-muted',
};

function Seat({
  p,
  simNow,
  on,
  picked,
  onPress,
}: {
  p: Person;
  simNow: number;
  on: boolean;
  picked: boolean;
  onPress: () => void;
}) {
  const pct = Math.round((p.answered / TOTAL_QUESTIONS) * 100);
  const left = remainingOf(p, simNow);
  const glyph = {
    working: null,
    submitted: <CircleCheck aria-hidden className="size-4" />,
    disconnected: <WifiOff aria-hidden className="size-4" />,
    suspended: <Ban aria-hidden className="size-4" />,
    not_started: null,
  }[p.state];
  const slow = reasonsOf(p, simNow).includes('slow');
  const label = `${p.name}, ${STATE_META[p.state].label}, ${p.answered}/${TOTAL_QUESTIONS} câu${
    p.hiddenCount >= 3 ? `, rời màn hình ${p.hiddenCount} lần` : ''
  }${picked ? ', đã chọn' : ''}`;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      aria-pressed={picked}
      title={label}
      className={`relative flex aspect-square min-h-11 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border text-[13px] font-semibold ${SEAT_LOOK[p.state]} ${
        picked
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-bg'
          : on
            ? 'ring-2 ring-ring ring-offset-2 ring-offset-bg'
            : ''
      }`}
      style={
        p.state === 'working'
          ? {
              backgroundImage: `linear-gradient(to top, var(--color-primary-soft) ${pct}%, transparent ${pct}%)`,
            }
          : undefined
      }
    >
      {glyph ?? <span aria-hidden>{initials(p)}</span>}
      <span aria-hidden className="text-[11px] font-normal leading-none opacity-80">
        {glyph
          ? initials(p)
          : left !== null && left <= 300
            ? `${Math.ceil(left / 60)}'`
            : p.answered}
      </span>
      {p.hiddenCount >= 3 && (
        <Eye aria-hidden className="absolute top-0.5 right-0.5 size-3 text-danger" />
      )}
      {slow && <Turtle aria-hidden className="absolute top-0.5 left-0.5 size-3 text-warning" />}
      {p.device === 'revoked' && (
        <ShieldOff aria-hidden className="absolute bottom-0.5 left-0.5 size-3 text-danger" />
      )}
      {p.device === 'new' && (
        <Smartphone aria-hidden className="absolute bottom-0.5 left-0.5 size-3 text-warning" />
      )}
      {picked && (
        <CircleCheck
          aria-hidden
          className="absolute right-0.5 bottom-0.5 size-4 rounded-full bg-primary text-on-primary"
        />
      )}
    </button>
  );
}

export function GridView({ people, simNow, selected, openId, onPress }: ViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of people) map.set(p.className, [...(map.get(p.className) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [people]);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted" aria-label="Chú giải">
        <li>Chữ cái: tên gọi · số: câu đã làm · ô đầy dần: tiến độ</li>
        <li className="inline-flex items-center gap-1">
          <Eye aria-hidden className="size-4 text-danger" /> rời màn hình ≥ 3 lần
        </li>
        <li className="inline-flex items-center gap-1">
          <Turtle aria-hidden className="size-4 text-warning" /> chậm
        </li>
        <li className="inline-flex items-center gap-1">
          <Smartphone aria-hidden className="size-4 text-warning" /> thiết bị mới
        </li>
        <li className="inline-flex items-center gap-1">
          <ShieldOff aria-hidden className="size-4 text-danger" /> bị thu hồi
        </li>
      </ul>
      {groups.map(([className, list]) => (
        <section key={className} aria-label={`Lớp ${className}`} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg-muted">
            {className} · {list.length} người
          </h2>
          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(2.75rem,1fr))] lg:[grid-template-columns:repeat(auto-fill,minmax(3.25rem,1fr))]">
            {list.map((p) => (
              <Seat
                key={p.id}
                p={p}
                simNow={simNow}
                on={openId === p.id}
                picked={selected.has(p.id)}
                onPress={() => onPress(p.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
