// PROTOTYPE (Q207) — Phương án B: lưới ghế. Mỗi người một ô vuông, gom theo Lớp như dãy ghế; nhìn một lần thấy cả phòng.
// Ô có chữ cái đầu của tên gọi + biểu tượng trạng thái (không chỉ dựa vào màu); ô "đang làm" được tô dần từ đáy theo số câu đã làm.
import { Ban, CircleCheck, Eye, ShieldOff, Smartphone, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { type Person, remainingOf } from './room';
import { countsOf, STATE_META, SummaryBar, type VariantProps } from './shared';

const initials = (p: Person) =>
  p.name
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('');

function Seat({
  p,
  simNow,
  selected,
  onOpen,
}: {
  p: Person;
  simNow: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const pct = Math.round((p.answered / 40) * 100);
  const left = remainingOf(p, simNow);
  const base =
    'relative flex aspect-square min-h-11 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border text-[13px] font-semibold';
  const look: Record<Person['state'], string> = {
    working: 'border-primary text-fg',
    submitted: 'border-success bg-success-soft text-success',
    disconnected: 'border-warning bg-warning-soft text-warning',
    suspended: 'border-danger bg-danger-soft text-danger',
    not_started: 'border-dashed border-border-strong text-fg-muted',
  };
  const glyph = {
    working: null,
    submitted: <CircleCheck aria-hidden className="size-4" />,
    disconnected: <WifiOff aria-hidden className="size-4" />,
    suspended: <Ban aria-hidden className="size-4" />,
    not_started: null,
  }[p.state];
  const label = `${p.name}, ${STATE_META[p.state].label}, ${p.answered}/40 câu${p.hiddenCount >= 3 ? `, rời màn hình ${p.hiddenCount} lần` : ''}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className={`${base} ${look[p.state]} ${selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-bg' : ''}`}
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
            : `${p.answered}`}
      </span>
      {p.hiddenCount >= 3 && (
        <Eye aria-hidden className="absolute top-0.5 right-0.5 size-3 text-danger" />
      )}
      {p.device === 'revoked' && (
        <ShieldOff aria-hidden className="absolute bottom-0.5 left-0.5 size-3 text-danger" />
      )}
      {p.device === 'new' && (
        <Smartphone aria-hidden className="absolute bottom-0.5 left-0.5 size-3 text-warning" />
      )}
    </button>
  );
}

export function VariantB({ people, simNow, open, selectedId }: VariantProps) {
  const counts = useMemo(() => countsOf(people), [people]);
  const groups = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of people) map.set(p.className, [...(map.get(p.className) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [people]);

  return (
    <div className="flex flex-col gap-4">
      <SummaryBar counts={counts} total={people.length} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted" aria-label="Chú giải">
        <li>Chữ cái: tên gọi · số: câu đã làm · ô đầy dần: tiến độ</li>
        <li className="inline-flex items-center gap-1">
          <Eye aria-hidden className="size-4 text-danger" /> rời màn hình ≥ 3 lần
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
                selected={selectedId === p.id}
                onOpen={() => open(p.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
