import { Eye, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonitorPerson } from '../../monitor';
import { isLive } from '../../monitor-view';
import { Badge, Button, Dialog } from '..';
import { ProgressBar, ReasonBadges, Remaining, StateBadge, useMedia } from './parts';

export interface PanelHandlers {
  onExtend: (userId: string) => void;
  onForce: (userId: string) => void;
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
  onClose,
}: {
  person: MonitorPerson | undefined;
  totalItems: number;
  handlers: PanelHandlers;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const wide = useMedia('(min-width: 1024px)');
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
        aria-label={t('monitor.panel.label', { name: person.fullName })}
        className="fixed top-(--app-header-h) right-0 bottom-0 z-30 flex w-96 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-raised p-5 shadow-xl"
      >
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft"
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
          <StateBadge state={person.state} />
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
