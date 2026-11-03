// PROTOTYPE (Q207), vứt đi sau khi chọn. Phần dùng chung của ba phương án: chỉ những thứ mà ui-design mục 10 đã bắt buộc
// cho mẫu Theo dõi (thanh tóm tắt, hành động trong ngăn kéo / bottom sheet). Bố cục bên trong do từng phương án tự quyết.
import {
  Ban,
  CircleCheck,
  CircleDashed,
  Eye,
  PenLine,
  ShieldOff,
  Smartphone,
  TriangleAlert,
  Turtle,
  WifiOff,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Badge, Button, Dialog, TextField } from '../../lib/ui';
import { useToast } from '../../lib/ui/toast';
import {
  clock,
  type Person,
  type Reason,
  type RoomActions,
  type RoomState,
  reasonsOf,
  remainingOf,
  TOTAL_QUESTIONS,
} from './room';

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

export interface PanelHandlers {
  actions: RoomActions;
  onExtend: (id: number) => void;
  onForce: (id: number) => void;
  onSuspend: (id: number) => void;
}

export function PersonPanel({
  person,
  simNow,
  handlers,
  onClose,
}: {
  person: Person | undefined;
  simNow: number;
  handlers: PanelHandlers;
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
        <PanelBody person={person} simNow={simNow} handlers={handlers} />
      </aside>
    );
  }
  return (
    <Dialog open={!!person} onClose={onClose} title={person?.name ?? ''}>
      {person && <PanelBody person={person} simNow={simNow} handlers={handlers} hideTitle />}
    </Dialog>
  );
}

function PanelBody({
  person,
  simNow,
  handlers,
  hideTitle,
}: {
  person: Person;
  simNow: number;
  handlers: PanelHandlers;
  hideTitle?: boolean;
}) {
  const toast = useToast();
  const { actions } = handlers;
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
          <ReasonBadges person={person} simNow={simNow} />
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
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!live} onClick={() => handlers.onExtend(person.id)}>
            Cộng giờ…
          </Button>
          <Button disabled={!live} onClick={() => handlers.onForce(person.id)}>
            Buộc nộp…
          </Button>
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
          <Button disabled={!live} onClick={run(() => actions.warn(person.id), 'Đã Cảnh cáo')}>
            Cảnh cáo
          </Button>
        </div>
        <Button variant="danger" disabled={!live} onClick={() => handlers.onSuspend(person.id)}>
          Đình chỉ…
        </Button>
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

const REASON_BADGE: Record<Reason, (p: Person) => ReactNode> = {
  disconnected: () => (
    <Badge tone="warning" icon={<WifiOff aria-hidden className="size-3.5" />}>
      Mất kết nối
    </Badge>
  ),
  hidden: (p) => (
    <Badge tone="danger" icon={<Eye aria-hidden className="size-3.5" />}>
      Rời màn hình {p.hiddenCount} lần
    </Badge>
  ),
  device: (p) =>
    p.device === 'revoked' ? (
      <Badge tone="danger" icon={<ShieldOff aria-hidden className="size-3.5" />}>
        Thiết bị bị thu hồi
      </Badge>
    ) : (
      <Badge tone="warning" icon={<Smartphone aria-hidden className="size-3.5" />}>
        Thiết bị mới
      </Badge>
    ),
  slow: (p) => (
    <Badge tone="warning" icon={<Turtle aria-hidden className="size-3.5" />}>
      Chậm: {p.answered}/{TOTAL_QUESTIONS} câu
    </Badge>
  ),
};

/** Các dấu hiệu "cần chú ý" (Q252) của một người, mỗi dấu hiệu một huy hiệu có biểu tượng và chữ. */
export function ReasonBadges({ person, simNow }: { person: Person; simNow: number }) {
  const reasons = reasonsOf(person, simNow);
  return (
    <>
      {reasons.map((r) => (
        <span key={r}>{REASON_BADGE[r](person)}</span>
      ))}
    </>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="text-sm text-fg-muted">{children}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Hủy</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** Cộng giờ cho một người, một nhóm hoặc cả phòng: luôn nêu số người sẽ được cộng và bắt nhập lý do (glossary: Cộng giờ). */
export function ExtendDialog({
  count,
  scope,
  onConfirm,
  onClose,
}: {
  count: number;
  scope: string;
  onConfirm: (minutes: number, reason: string) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(5);
  const [reason, setReason] = useState('');
  return (
    <Dialog open onClose={onClose} title="Cộng giờ">
      <p className="text-sm text-fg-muted">
        {scope}: <strong className="text-fg">{count} người</strong> đang làm sẽ được cộng giờ và
        thấy ngay trên màn hình của họ.
      </p>
      <fieldset className="m-0 grid grid-cols-4 gap-2 border-0 p-0">
        <legend className="sr-only">Số phút</legend>
        {[5, 10, 15, 30].map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={minutes === m}
            onClick={() => setMinutes(m)}
            className={`min-h-12 cursor-pointer rounded-lg border text-sm font-semibold pointer-fine:min-h-9 ${
              minutes === m
                ? 'border-primary bg-primary-soft text-on-primary-soft'
                : 'border-border-strong bg-surface'
            }`}
          >
            +{m} phút
          </button>
        ))}
      </fieldset>
      <TextField
        id="extend-reason"
        label="Lý do (bắt buộc)"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ví dụ: mất điện phòng máy"
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Hủy</Button>
        <Button
          variant="primary"
          disabled={count === 0 || reason.trim() === ''}
          onClick={() => onConfirm(minutes, reason.trim())}
        >
          Cộng {minutes} phút cho {count} người
        </Button>
      </div>
    </Dialog>
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
