// PROTOTYPE (Q207), vứt đi sau khi chọn. Phần dùng chung của ba phương án: chỉ những thứ mà ui-design mục 10 đã bắt buộc
// cho mẫu Theo dõi (thanh tóm tắt, hành động trong ngăn kéo / bottom sheet). Bố cục bên trong do từng phương án tự quyết.
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Eye,
  PenLine,
  ShieldOff,
  Smartphone,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Badge, Button, Dialog } from '../../lib/ui';
import { useToast } from '../../lib/ui/toast';
import {
  clock,
  type Person,
  type RoomActions,
  type RoomState,
  remainingOf,
  TOTAL_QUESTIONS,
} from './room';

export interface VariantProps {
  people: Person[];
  simNow: number;
  actions: RoomActions;
  /** Mở ngăn kéo / bottom sheet của một người. */
  open: (id: number) => void;
  selectedId: number | null;
}

export const STATE_META: Record<
  RoomState,
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'; icon: ReactNode }
> = {
  not_started: {
    label: 'Chưa vào',
    tone: 'neutral',
    icon: <CircleDashed aria-hidden className="size-3.5" />,
  },
  working: {
    label: 'Đang làm',
    tone: 'primary',
    icon: <PenLine aria-hidden className="size-3.5" />,
  },
  disconnected: {
    label: 'Mất kết nối',
    tone: 'warning',
    icon: <WifiOff aria-hidden className="size-3.5" />,
  },
  submitted: {
    label: 'Đã nộp',
    tone: 'success',
    icon: <CircleCheck aria-hidden className="size-3.5" />,
  },
  suspended: { label: 'Đình chỉ', tone: 'danger', icon: <Ban aria-hidden className="size-3.5" /> },
};

export function StateBadge({ state }: { state: RoomState }) {
  const meta = STATE_META[state];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

export function DeviceBadge({ device }: { device: Person['device'] }) {
  if (device === 'ok') return null;
  return device === 'revoked' ? (
    <Badge tone="danger" icon={<ShieldOff aria-hidden className="size-3.5" />}>
      Thiết bị bị thu hồi
    </Badge>
  ) : (
    <Badge tone="warning" icon={<Smartphone aria-hidden className="size-3.5" />}>
      Thiết bị mới
    </Badge>
  );
}

/** Thời gian còn lại, đổi màu và có chữ khi sắp hết (còn 5 phút, còn 1 phút) như đồng hồ của Người dự thi. */
export function Remaining({ person, simNow }: { person: Person; simNow: number }) {
  const left = remainingOf(person, simNow);
  if (left === null) return <span className="text-fg-muted">–</span>;
  const tone =
    left <= 60 ? 'text-danger font-semibold' : left <= 300 ? 'text-warning font-semibold' : '';
  return (
    <span className={`tabular-nums ${tone}`}>
      {clock(left)}
      {left <= 300 && (
        <TriangleAlert aria-label="Sắp hết giờ" className="ml-1 inline size-3.5 align-[-2px]" />
      )}
    </span>
  );
}

export function ProgressBar({ value, max = TOTAL_QUESTIONS }: { value: number; max?: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-16 overflow-hidden rounded-full bg-border" aria-hidden>
        <span className="block h-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="text-sm tabular-nums">
        {value}/{max}
      </span>
    </span>
  );
}

export interface Counts {
  working: number;
  submitted: number;
  disconnected: number;
  not_started: number;
  violations: number;
}

export function countsOf(people: Person[]): Counts {
  const c: Counts = { working: 0, submitted: 0, disconnected: 0, not_started: 0, violations: 0 };
  for (const p of people) {
    if (p.state === 'working') c.working++;
    else if (p.state === 'submitted') c.submitted++;
    else if (p.state === 'disconnected') c.disconnected++;
    else if (p.state === 'not_started') c.not_started++;
    if (p.warnings > 0 || p.state === 'suspended') c.violations++;
  }
  return c;
}

const TILES: { key: keyof Counts; label: string; tone: string }[] = [
  { key: 'working', label: 'Đang làm', tone: 'text-on-primary-soft' },
  { key: 'submitted', label: 'Đã nộp', tone: 'text-success' },
  { key: 'disconnected', label: 'Mất kết nối', tone: 'text-warning' },
  { key: 'not_started', label: 'Chưa vào', tone: 'text-fg-muted' },
  { key: 'violations', label: 'Vi phạm', tone: 'text-danger' },
];

/** Thanh tóm tắt (ui-design mục 10): dính trên cùng khi cuộn. Bấm ô nào thì phương án có thể dùng làm bộ lọc. */
export function SummaryBar({
  counts,
  total,
  active,
  onPick,
}: {
  counts: Counts;
  total: number;
  active?: keyof Counts | null;
  onPick?: (key: keyof Counts) => void;
}) {
  return (
    <section
      aria-label={`Tóm tắt phòng thi, ${total} người`}
      className="sticky top-(--app-header-h) z-10 -mx-4 grid grid-cols-5 gap-1 border-b border-border bg-surface px-2 py-2 md:mx-0 md:gap-2 md:rounded-xl md:border md:px-3"
    >
      {TILES.map((tile) => {
        const content = (
          <>
            <span className={`text-xl font-semibold tabular-nums ${tile.tone}`}>
              {counts[tile.key]}
            </span>
            <span className="text-[12px] leading-tight text-fg-muted md:text-sm">{tile.label}</span>
          </>
        );
        const shape = `flex min-h-12 flex-col items-center justify-center rounded-lg px-1 text-center ${
          active === tile.key ? 'bg-primary-soft' : ''
        }`;
        return onPick ? (
          <button
            key={tile.key}
            type="button"
            aria-pressed={active === tile.key}
            onClick={() => onPick(tile.key)}
            className={`${shape} cursor-pointer hover:bg-primary-soft`}
          >
            {content}
          </button>
        ) : (
          <div key={tile.key} className={shape}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

/** Màn rộng từ 1024 px thì hành động nằm trong ngăn kéo bên phải; hẹp hơn thì là bottom sheet (Dialog). */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const on = () => setWide(media.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, []);
  return wide;
}

export function PersonPanel({
  person,
  simNow,
  actions,
  onClose,
}: {
  person: Person | undefined;
  simNow: number;
  actions: RoomActions;
  onClose: () => void;
}) {
  const wide = useWide();
  useEffect(() => {
    if (!wide || !person) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, person, onClose]);

  if (wide) {
    if (!person) return null;
    return (
      <aside
        aria-label={`Chi tiết ${person.name}`}
        className="fixed top-(--app-header-h) right-0 bottom-0 z-30 flex w-96 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-raised p-5 shadow-xl"
      >
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft"
        >
          <X aria-hidden className="size-5" />
        </button>
        <PanelBody person={person} simNow={simNow} actions={actions} />
      </aside>
    );
  }
  return (
    <Dialog open={!!person} onClose={onClose} title={person?.name ?? ''}>
      {person && <PanelBody person={person} simNow={simNow} actions={actions} hideTitle />}
    </Dialog>
  );
}

function PanelBody({
  person,
  simNow,
  actions,
  hideTitle,
}: {
  person: Person;
  simNow: number;
  actions: RoomActions;
  hideTitle?: boolean;
}) {
  const toast = useToast();
  const live = person.state === 'working' || person.state === 'disconnected';
  const run = (fn: () => void, message: string) => () => {
    fn();
    toast(`${message} (giả lập)`);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 pr-10">
        {!hideTitle && <h2 className="text-lg font-semibold">{person.name}</h2>}
        <p className="text-sm text-fg-muted">
          {person.code} · {person.className}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <StateBadge state={person.state} />
          <DeviceBadge device={person.device} />
          {person.warnings > 0 && (
            <Badge tone="danger" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
              Cảnh cáo {person.warnings}
            </Badge>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Đã trả lời" value={<ProgressBar value={person.answered} />} />
        <Stat label="Còn lại" value={<Remaining person={person} simNow={simNow} />} />
        <Stat
          label="Rời màn hình"
          value={
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye aria-hidden className="size-4 text-fg-muted" />
              {person.hiddenCount} lần
            </span>
          }
        />
        <Stat label="Thiết bị" value={person.deviceLabel} />
      </dl>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Cộng giờ</p>
        <div className="grid grid-cols-3 gap-2">
          {[5, 10, 15].map((m) => (
            <Button
              key={m}
              disabled={!live}
              onClick={run(() => actions.extend([person.id], m), `Đã cộng ${m} phút`)}
            >
              +{m} phút
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {person.device === 'revoked' ? (
            <Button onClick={run(() => actions.pardon(person.id), 'Đã Hoàn tác Thu hồi')}>
              Hoàn tác Thu hồi
            </Button>
          ) : (
            <Button
              disabled={!live}
              onClick={run(() => actions.revoke(person.id), 'Đã Thu hồi thiết bị')}
            >
              Thu hồi thiết bị
            </Button>
          )}
          <Button
            disabled={!live}
            onClick={run(() => actions.forceSubmit([person.id]), 'Đã Buộc nộp')}
          >
            Buộc nộp
          </Button>
          <Button disabled={!live} onClick={run(() => actions.warn(person.id), 'Đã Cảnh cáo')}>
            Cảnh cáo
          </Button>
          <Button
            variant="danger"
            disabled={!live}
            onClick={run(() => actions.suspend(person.id), 'Đã Đình chỉ')}
          >
            Đình chỉ
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Nhật ký</p>
        {person.events.length === 0 ? (
          <p className="text-sm text-fg-muted">Chưa có sự kiện nào.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {person.events.map((e) => (
              <li key={`${e.at}-${e.text}`} className="flex justify-between gap-3">
                <span>{e.text}</span>
                <span className="text-fg-muted tabular-nums">phút {Math.floor(e.at / 60)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Thanh nổi chuyển phương án (nằm ngoài thiết kế đang xét). Phím ← → cũng chuyển. */
export function VariantSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    if (next) onChange(next.key);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (import.meta.env.PROD && !import.meta.env.VITE_SHOW_SWITCHER) return null;
  const now = variants[index];
  return (
    <div
      data-testid="variant-switcher"
      className="fixed bottom-[calc(var(--app-tabbar-h)+0.75rem)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fg p-1 text-bg shadow-xl lg:bottom-4"
    >
      <button
        type="button"
        aria-label="Phương án trước"
        onClick={() => go(-1)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-bg/20"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <span className="min-w-44 px-2 text-center text-sm font-semibold">
        {now?.key} · {now?.name}
      </span>
      <button
        type="button"
        aria-label="Phương án sau"
        onClick={() => go(1)}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full hover:bg-bg/20"
      >
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}
