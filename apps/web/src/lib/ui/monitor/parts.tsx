import type { AttentionReason, MonitorState } from '@exam/shared';
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
} from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { MonitorPerson } from '../../monitor';
import { type Counts, remainingSecondsAt } from '../../monitor-view';
import { warningOf } from '../../take/clock';
import { Badge } from '..';

// Các mảnh dùng chung của màn Theo dõi (docs/plan/slice-4.md, Q252–Q254; docs/ui-design.md mục 10).

export const STATE_TONE: Record<
  MonitorState,
  'neutral' | 'primary' | 'success' | 'warning' | 'danger'
> = {
  not_started: 'neutral',
  working: 'primary',
  disconnected: 'warning',
  submitted: 'success',
  suspended: 'danger',
};

const STATE_ICON: Record<MonitorState, ReactNode> = {
  not_started: <CircleDashed aria-hidden className="size-3.5" />,
  working: <PenLine aria-hidden className="size-3.5" />,
  disconnected: <WifiOff aria-hidden className="size-3.5" />,
  submitted: <CircleCheck aria-hidden className="size-3.5" />,
  suspended: <Ban aria-hidden className="size-3.5" />,
};

export function StateBadge({ state }: { state: MonitorState }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATE_TONE[state]} icon={STATE_ICON[state]}>
      {t(`monitor.state.${state}`)}
    </Badge>
  );
}

/** Mốc giờ của ảnh chụp mới nhất, để mọi ô "Còn lại" trôi theo đồng hồ đơn điệu giữa hai lần hỏi lại. */
export const SnapshotClock = createContext<{ serverNow: string; receivedAt: number }>({
  serverNow: new Date(0).toISOString(),
  receivedAt: 0,
});

// Một đồng hồ 1 giây dùng chung: chỉ các ô "Còn lại" đăng ký, nên mỗi giây không vẽ lại cả danh sách.
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;
let second = Math.floor(performance.now() / 1000);
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    ticker = setInterval(() => {
      second = Math.floor(performance.now() / 1000);
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearInterval(ticker);
  };
}
const useSecond = () =>
  useSyncExternalStore(
    subscribe,
    () => second,
    () => second,
  );

/** Giây còn lại của một người theo ảnh chụp mới nhất; `null` nếu đã nộp hoặc chưa vào. */
export function useRemaining(person: MonitorPerson): number | null {
  const { serverNow, receivedAt } = useContext(SnapshotClock);
  useSecond();
  if (person.state === 'submitted' || person.state === 'suspended') return null;
  return remainingSecondsAt(person.deadline, serverNow, performance.now() - receivedAt);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clockText = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h > 0 ? `${h}:${pad(m)}` : pad(m)}:${pad(seconds % 60)}`;
};

/** Giờ còn lại, đổi màu và có biểu tượng khi sắp hết (còn 5 phút, còn 1 phút) như đồng hồ của Người dự thi. */
export function Remaining({ person }: { person: MonitorPerson }) {
  const { t } = useTranslation();
  const left = useRemaining(person);
  if (left === null) return <span className="text-fg-muted">–</span>;
  const level = warningOf(left * 1000); // cùng mốc 5 phút và 1 phút như đồng hồ của Người dự thi
  const tone =
    level === 'one' || level === 'over'
      ? 'text-danger font-semibold'
      : level === 'five'
        ? 'text-warning font-semibold'
        : '';
  return (
    <span className={`tabular-nums ${tone}`}>
      {clockText(left)}
      {level !== 'none' && (
        <TriangleAlert
          role="img"
          aria-label={t('monitor.almostOver')}
          className="ml-1 inline size-3.5 align-[-2px]"
        />
      )}
    </span>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-16 overflow-hidden rounded-full bg-border" aria-hidden>
        <span
          className="block h-full bg-primary"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </span>
      <span className="text-sm tabular-nums">
        {value}/{max}
      </span>
    </span>
  );
}

const TILES: { key: keyof Counts; tone: string }[] = [
  { key: 'working', tone: 'text-on-primary-soft' },
  { key: 'submitted', tone: 'text-success' },
  { key: 'disconnected', tone: 'text-warning' },
  { key: 'not_started', tone: 'text-fg-muted' },
  { key: 'violations', tone: 'text-danger' },
];

/** Thanh tóm tắt (ui-design mục 10): dính trên cùng khi cuộn; bấm một ô để lọc theo trạng thái đó. */
export function SummaryBar({
  counts,
  total,
  active,
  onPick,
}: {
  counts: Counts;
  total: number;
  active: keyof Counts | null;
  onPick: (key: keyof Counts) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('monitor.summary', { count: total })}
      className="sticky top-(--app-header-h) z-10 -mx-4 grid grid-cols-5 gap-1 border-b border-border bg-surface px-2 py-2 md:mx-0 md:gap-2 md:rounded-xl md:border md:px-3"
    >
      {TILES.map((tile) => (
        <button
          key={tile.key}
          type="button"
          aria-pressed={active === tile.key}
          onClick={() => onPick(tile.key)}
          className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg px-1 text-center hover:bg-primary-soft ${
            active === tile.key ? 'bg-primary-soft' : ''
          }`}
        >
          <span className={`text-xl font-semibold tabular-nums ${tile.tone}`}>
            {counts[tile.key]}
          </span>
          <span className="text-[13px] leading-tight text-fg-muted md:text-sm">
            {t(tile.key === 'violations' ? 'monitor.tile.violations' : `monitor.state.${tile.key}`)}
          </span>
        </button>
      ))}
    </section>
  );
}

/** Các dấu hiệu "Cần chú ý" (Q252) của một người, mỗi dấu hiệu một huy hiệu có biểu tượng và chữ. */
export function ReasonBadges({ person, total }: { person: MonitorPerson; total: number }) {
  const { t } = useTranslation();
  const badge: Record<AttentionReason, ReactNode> = {
    disconnected: (
      <Badge tone="warning" icon={<WifiOff aria-hidden className="size-3.5" />}>
        {t('monitor.state.disconnected')}
      </Badge>
    ),
    hidden: (
      <Badge tone="danger" icon={<Eye aria-hidden className="size-3.5" />}>
        {t('monitor.reason.hidden', { count: person.hiddenCount })}
      </Badge>
    ),
    device:
      person.device === 'revoked' ? (
        <Badge tone="danger" icon={<ShieldOff aria-hidden className="size-3.5" />}>
          {t('monitor.device.revoked')}
        </Badge>
      ) : (
        <Badge tone="warning" icon={<Smartphone aria-hidden className="size-3.5" />}>
          {t('monitor.device.new')}
        </Badge>
      ),
    slow: (
      <Badge tone="warning" icon={<Turtle aria-hidden className="size-3.5" />}>
        {t('monitor.reason.slow', { answered: person.answered, total })}
      </Badge>
    ),
  };
  return (
    <>
      {person.reasons.map((reason) => (
        <span key={reason}>{badge[reason]}</span>
      ))}
    </>
  );
}

/** Màn rộng từ 1024 px thì hành động nằm trong ngăn kéo bên phải; hẹp hơn thì là bottom sheet (Dialog). */
export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const on = () => setMatches(media.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, [query]);
  return matches;
}
