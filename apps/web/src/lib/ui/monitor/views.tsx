import { ATTENTION_HIDDEN_COUNT } from '@exam/shared';
import type { TFunction } from 'i18next';
import { Ban, CircleCheck, Eye, ShieldOff, Smartphone, Turtle, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonitorPerson } from '../../monitor';
import { isLive } from '../../monitor-view';
import { warningOf } from '../../take/clock';
import { Button } from '..';
import { DataList } from '../data-list';
import { ProgressBar, ReasonBadges, Remaining, StateBadge, useRemaining } from './parts';

// Ba chế độ xem theo mật độ (Q253): Thẻ cho ít người, Bảng cho vài chục đến vài trăm, Lưới cho đông người.

export interface ViewProps {
  /** Đã qua bộ lọc và ô tìm. */
  people: MonitorPerson[];
  totalItems: number;
  selected: ReadonlySet<string>;
  selectMode: boolean;
  openId: string | null;
  /** Chạm vào một người: chọn nếu đang ở chế độ chọn nhiều, ngược lại mở ngăn kéo. */
  onPress: (userId: string) => void;
  onOpen: (userId: string) => void;
  onExtend: (userId: string) => void;
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

const classOf = (p: MonitorPerson) => p.classLabel ?? '';
const identity = (p: MonitorPerson) => [p.code, p.classLabel].filter(Boolean).join(' · ');

// ---------------------------------------------------------------- Thẻ
export function CardsView({
  people,
  totalItems,
  selected,
  selectMode,
  openId,
  onPress,
  onOpen,
  onExtend,
}: ViewProps) {
  const { t } = useTranslation();
  return (
    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {people.map((p) => (
        <li
          key={p.userId}
          className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-sm ${
            selected.has(p.userId) || openId === p.userId
              ? 'border-primary ring-1 ring-primary'
              : 'border-border'
          }`}
        >
          <div className="flex items-start gap-3">
            {selectMode && (
              <Check
                checked={selected.has(p.userId)}
                label={t('monitor.pick', { name: p.fullName })}
                onChange={() => onPress(p.userId)}
              />
            )}
            <button
              type="button"
              onClick={() => onPress(p.userId)}
              className="min-h-12 min-w-0 flex-1 cursor-pointer text-left"
            >
              <p className="font-semibold">{p.fullName}</p>
              <p className="text-[13px] text-fg-muted">{identity(p)}</p>
            </button>
            <Remaining person={p} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StateBadge state={p.state} />
            <ReasonBadges person={p} total={totalItems} />
          </div>
          <ProgressBar value={p.answered} max={totalItems} />
          {!selectMode && (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!isLive(p)} onClick={() => onExtend(p.userId)}>
                {t('monitor.action.extend')}
              </Button>
              <Button variant="primary" onClick={() => onOpen(p.userId)}>
                {t('monitor.action.details')}
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
  totalItems,
  selected,
  selectMode,
  openId,
  onPress,
  onToggleAll,
}: ViewProps) {
  const { t } = useTranslation();
  const nameCell = (p: MonitorPerson) => (
    <button
      type="button"
      onClick={() => onPress(p.userId)}
      className={`flex min-h-12 w-full cursor-pointer flex-col items-start justify-center text-left pointer-fine:min-h-9 ${
        openId === p.userId ? 'font-semibold text-primary' : ''
      }`}
    >
      <span>{p.fullName}</span>
      <span className="text-[13px] text-fg-muted">{identity(p)}</span>
    </button>
  );
  const allSelected = people.length > 0 && people.every((p) => selected.has(p.userId));
  return (
    <DataList
      items={people}
      rowKey={(p) => p.userId}
      selectionHeader={
        selectMode ? (
          <Check checked={allSelected} label={t('monitor.pickAllShown')} onChange={onToggleAll} />
        ) : undefined
      }
      selectionCell={
        selectMode
          ? (p) => (
              <Check
                checked={selected.has(p.userId)}
                label={t('monitor.pick', { name: p.fullName })}
                onChange={() => onPress(p.userId)}
              />
            )
          : undefined
      }
      columns={[
        { key: 'name', header: t('monitor.col.name'), cell: nameCell },
        {
          key: 'state',
          header: t('monitor.col.state'),
          cell: (p) => <StateBadge state={p.state} />,
        },
        {
          key: 'answered',
          header: t('monitor.col.answered'),
          cell: (p) => <ProgressBar value={p.answered} max={totalItems} />,
        },
        { key: 'left', header: t('monitor.col.remaining'), cell: (p) => <Remaining person={p} /> },
        {
          key: 'signs',
          header: t('monitor.col.signs'),
          from: 'lg',
          cell: (p) => (
            <span className="flex flex-wrap gap-1">
              <ReasonBadges person={p} total={totalItems} />
            </span>
          ),
        },
      ]}
      card={(p) => (
        <div
          className={`flex items-start gap-2 rounded-xl border bg-surface px-4 py-2 ${
            selected.has(p.userId) ? 'border-primary ring-1 ring-primary' : 'border-border'
          }`}
        >
          {selectMode && (
            <Check
              checked={selected.has(p.userId)}
              label={t('monitor.pick', { name: p.fullName })}
              onChange={() => onPress(p.userId)}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              {nameCell(p)}
              <StateBadge state={p.state} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-sm">
              <ProgressBar value={p.answered} max={totalItems} />
              <Remaining person={p} />
            </div>
            <div className="flex flex-wrap gap-1 pb-1 empty:hidden">
              <ReasonBadges person={p} total={totalItems} />
            </div>
          </div>
        </div>
      )}
    />
  );
}

// ---------------------------------------------------------------- Lưới
/** Hai từ cuối của họ tên (tên gọi), viết tắt. */
const initials = (p: MonitorPerson) =>
  p.fullName
    .split(' ')
    .slice(-2)
    .map((w) => w[0])
    .join('');

const SEAT_LOOK: Record<MonitorPerson['state'], string> = {
  working: 'border-primary text-fg',
  submitted: 'border-success bg-success-soft text-success',
  disconnected: 'border-warning bg-warning-soft text-warning',
  suspended: 'border-danger bg-danger-soft text-danger',
  not_started: 'border-dashed border-border-strong text-fg-muted',
};

/** Dòng dưới của ô: chỉ phần này đăng ký đồng hồ 1 giây, nên mỗi giây không vẽ lại cả trăm ô. */
function SeatFoot({ p, glyph }: { p: MonitorPerson; glyph: boolean }) {
  const { t } = useTranslation();
  const left = useRemaining(p);
  const text = glyph
    ? initials(p)
    : left !== null && warningOf(left * 1000) !== 'none'
      ? t('monitor.minutesShort', { count: Math.ceil(left / 60) })
      : String(p.answered);
  return (
    <span aria-hidden className="text-[13px] font-normal leading-none opacity-80">
      {text}
    </span>
  );
}

/** Nhãn đọc được của một ô: đủ trạng thái, tiến độ và mọi dấu hiệu, vì các biểu tượng trên ô đều ẩn với trình đọc màn hình. */
function seatLabel(p: MonitorPerson, totalItems: number, picked: boolean, t: TFunction) {
  const signs = p.reasons.flatMap((reason) => {
    if (reason === 'hidden') return [t('monitor.reason.hidden', { count: p.hiddenCount })];
    if (reason === 'slow')
      return [t('monitor.reason.slow', { answered: p.answered, total: totalItems })];
    if (reason === 'device')
      return [t(`monitor.device.${p.device === 'revoked' ? 'revoked' : 'new'}`)];
    return [];
  });
  return [
    p.fullName,
    t(`monitor.state.${p.state}`),
    t('monitor.seatProgress', { answered: p.answered, total: totalItems }),
    ...signs.filter(
      (sign) => !(p.state === 'disconnected' && sign === t('monitor.state.disconnected')),
    ),
    p.warnings > 0 ? t('monitor.panel.warnings', { count: p.warnings }) : '',
    picked ? t('monitor.picked') : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function Seat({
  p,
  totalItems,
  on,
  picked,
  onPress,
}: {
  p: MonitorPerson;
  totalItems: number;
  on: boolean;
  picked: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const pct = totalItems > 0 ? Math.round((p.answered / totalItems) * 100) : 0;
  const glyph = {
    working: null,
    submitted: <CircleCheck aria-hidden className="size-4" />,
    disconnected: <WifiOff aria-hidden className="size-4" />,
    suspended: <Ban aria-hidden className="size-4" />,
    not_started: null,
  }[p.state];
  const label = seatLabel(p, totalItems, picked, t);
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      aria-pressed={picked}
      title={label}
      className={`relative flex aspect-square min-h-12 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border text-[13px] font-semibold ${SEAT_LOOK[p.state]} ${
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
      <SeatFoot p={p} glyph={glyph !== null} />
      {p.reasons.includes('hidden') && (
        <Eye aria-hidden className="absolute top-0.5 right-0.5 size-3 text-danger" />
      )}
      {p.reasons.includes('slow') && (
        <Turtle aria-hidden className="absolute top-0.5 left-0.5 size-3 text-warning" />
      )}
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

export function GridView({ people, totalItems, selected, openId, onPress }: ViewProps) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const map = new Map<string, MonitorPerson[]>();
    for (const p of people) map.set(classOf(p), [...(map.get(classOf(p)) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [people]);
  return (
    <div className="flex flex-col gap-4">
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted"
        aria-label={t('monitor.legend.label')}
      >
        <li>{t('monitor.legend.how')}</li>
        <li className="inline-flex items-center gap-1">
          <Eye aria-hidden className="size-4 text-danger" />{' '}
          {t('monitor.legend.hidden', { count: ATTENTION_HIDDEN_COUNT })}
        </li>
        <li className="inline-flex items-center gap-1">
          <Turtle aria-hidden className="size-4 text-warning" /> {t('monitor.legend.slow')}
        </li>
        <li className="inline-flex items-center gap-1">
          <Smartphone aria-hidden className="size-4 text-warning" /> {t('monitor.device.new')}
        </li>
        <li className="inline-flex items-center gap-1">
          <ShieldOff aria-hidden className="size-4 text-danger" /> {t('monitor.device.revoked')}
        </li>
      </ul>
      {groups.map(([className, list]) => (
        <section
          key={className}
          aria-label={t('monitor.classSection', { name: className || t('monitor.noClass') })}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-semibold text-fg-muted">
            {className || t('monitor.noClass')} · {t('monitor.people', { count: list.length })}
          </h3>
          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(3rem,1fr))] lg:[grid-template-columns:repeat(auto-fill,minmax(3.25rem,1fr))]">
            {list.map((p) => (
              <Seat
                key={p.userId}
                p={p}
                totalItems={totalItems}
                on={openId === p.userId}
                picked={selected.has(p.userId)}
                onPress={() => onPress(p.userId)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
