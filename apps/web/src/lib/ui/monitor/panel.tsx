import { Eye, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonitorPerson } from '../../monitor';
import { isLive } from '../../monitor-view';
import { Badge, Button, Dialog } from '..';
import {
  clockText,
  ProgressBar,
  ReasonBadges,
  Remaining,
  StateBadge,
  useMedia,
  useUndoLeft,
} from './parts';

export interface PanelHandlers {
  onExtend: (userId: string) => void;
  onForce: (userId: string) => void;
  onUndo: (userId: string) => void;
  onRevoke: (userId: string) => void;
  onPardon: (userId: string) => void;
  onWarn: (userId: string) => void;
  onSuspend: (userId: string) => void;
}

/** Ngăn kéo bên phải từ 1024 px, bottom sheet (Dialog) ở màn hẹp (ui-design mục 10). */
export function PersonPanel({
  person,
  totalItems,
  handlers,
  closeOnEscape,
  onClose,
}: {
  person: MonitorPerson | undefined;
  totalItems: number;
  handlers: PanelHandlers;
  /** Tắt khi có hộp thoại đang mở trên ngăn kéo: Esc chỉ đóng hộp thoại, không đóng luôn ngăn kéo. */
  closeOnEscape: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const wide = useMedia('(min-width: 1024px)');
  useEffect(() => {
    if (!wide || !person || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, person, closeOnEscape, onClose]);

  if (wide) {
    if (!person) return null;
    return (
      <aside
        aria-label={t('monitor.panel.label', { name: person.fullName })}
        className="fixed top-(--app-header-h) right-0 bottom-0 z-30 flex w-96 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-raised p-5 shadow-xl"
      >
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="absolute top-2 right-2 inline-flex size-12 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft"
        >
          <X aria-hidden className="size-5" />
        </button>
        <PanelBody person={person} totalItems={totalItems} handlers={handlers} />
      </aside>
    );
  }
  return (
    <Dialog open={!!person} onClose={onClose} title={person?.fullName ?? ''}>
      {person && (
        <PanelBody person={person} totalItems={totalItems} handlers={handlers} hideTitle />
      )}
    </Dialog>
  );
}

function PanelBody({
  person,
  totalItems,
  handlers,
  hideTitle,
}: {
  person: MonitorPerson;
  totalItems: number;
  handlers: PanelHandlers;
  hideTitle?: boolean;
}) {
  const { t } = useTranslation();
  const live = isLive(person);
  const id = person.userId;
  const canPardon = person.revokedDeviceId !== null && person.device !== 'ok';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 pr-10">
        {!hideTitle && <h2 className="text-lg font-semibold">{person.fullName}</h2>}
        <p className="text-sm text-fg-muted">
          {[person.code, person.classLabel].filter(Boolean).join(' · ')}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <StateBadge state={person.state} waiting={person.waiting} />
          <ReasonBadges person={person} total={totalItems} />
          {person.warnings > 0 && (
            <Badge tone="danger" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
              {t('monitor.panel.warnings', { count: person.warnings })}
            </Badge>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat
          label={t('monitor.col.answered')}
          value={<ProgressBar value={person.answered} max={totalItems} />}
        />
        <Stat label={t('monitor.col.remaining')} value={<Remaining person={person} />} />
        <Stat
          label={t('monitor.panel.hidden')}
          value={
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye aria-hidden className="size-4 text-fg-muted" />
              {t('monitor.panel.times', { count: person.hiddenCount })}
            </span>
          }
        />
        <Stat label={t('monitor.panel.device')} value={t(`monitor.deviceState.${person.device}`)} />
      </dl>

      {person.undoUntil && <UndoBanner person={person} onUndo={() => handlers.onUndo(id)} />}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!live} onClick={() => handlers.onExtend(id)}>
            {t('monitor.action.extend')}
          </Button>
          <Button disabled={!live} onClick={() => handlers.onForce(id)}>
            {t('monitor.action.force')}
          </Button>
          {canPardon ? (
            <Button onClick={() => handlers.onPardon(id)}>{t('monitor.action.pardon')}</Button>
          ) : (
            <Button
              disabled={!live || person.device === 'none'}
              onClick={() => handlers.onRevoke(id)}
            >
              {t('monitor.action.revoke')}
            </Button>
          )}
          <Button disabled={!live} onClick={() => handlers.onWarn(id)}>
            {t('monitor.action.warn')}
          </Button>
        </div>
        <Button variant="danger" disabled={!live} onClick={() => handlers.onSuspend(id)}>
          {t('monitor.action.suspend')}
        </Button>
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

/** Tầng bảo vệ thứ hai của Buộc nộp (Q278): Người ra đề thấy ngay mình còn bao lâu để mở lại bài của người này. */
function UndoBanner({ person, onUndo }: { person: MonitorPerson; onUndo: () => void }) {
  const { t } = useTranslation();
  const left = useUndoLeft(person.undoUntil);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm">
      {/* Chỉ câu mở đầu nằm trong vùng thông báo; đếm lùi đổi mỗi giây nên để ngoài, tránh đọc lại mỗi giây. */}
      <p>
        <strong role="status">{t('monitor.undo.bannerTitle')}</strong>{' '}
        {left !== null && left > 0
          ? t('monitor.undo.bannerLeft', { time: clockText(left) })
          : t('monitor.undo.bannerOver')}
      </p>
      <Button variant="primary" disabled={left === 0} onClick={onUndo}>
        {t('monitor.action.undo')}
      </Button>
    </div>
  );
}
