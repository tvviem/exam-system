import { VIOLATION_REASON_MAX } from '@exam/shared';
import { useTranslation } from 'react-i18next';
import { undoUntilOfEarliest } from '../../force-confirm';
import type { MonitorPerson } from '../../monitor';
import { ConfirmDialog, ExtendDialog, ForceDialog, ReasonDialog, UndoDialog } from './dialogs';
import { useUndoLeft } from './parts';
import type { MonitorActions, Scope } from './use-actions';

export type DialogState =
  | { kind: 'extend'; ids: string[]; scope: Scope }
  | { kind: 'force'; ids: string[]; scope: Scope }
  | { kind: 'undo'; ids: string[] }
  | { kind: 'revoke' | 'pardon' | 'warn' | 'suspend'; userId: string }
  | { kind: 'entry' };

const REVOKE_REASON_MAX = 500;

/** Dựng đúng một hộp thoại xác nhận của màn Theo dõi theo `dialog`; mọi thao tác nặng nêu số người bị ảnh hưởng. */
export function MonitorDialogs({
  dialog,
  actions,
  byId,
  liveAttempts,
  totalItems,
  entryClosed,
  notStarted,
  onClose,
}: {
  dialog: DialogState | null;
  actions: MonitorActions;
  byId: ReadonlyMap<string, MonitorPerson>;
  /** Mã Lượt đang làm của những người trong `userIds`. */
  liveAttempts: (userIds: string[]) => string[];
  totalItems: number;
  entryClosed: boolean;
  notStarted: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Người còn Hoàn tác được trong hộp Hoàn tác; hook gọi trước khi thoát sớm để thứ tự hook không đổi.
  const undoPeople =
    dialog?.kind === 'undo'
      ? dialog.ids.flatMap((id) => {
          const person = byId.get(id);
          return person?.undoUntil ? [person] : [];
        })
      : [];
  const undoLeft = useUndoLeft(undoUntilOfEarliest(undoPeople));
  if (!dialog) return null;
  const target = 'userId' in dialog ? byId.get(dialog.userId) : undefined;

  switch (dialog.kind) {
    case 'extend':
      return (
        <ExtendDialog
          count={liveAttempts(dialog.ids).length}
          scope={t(`monitor.scope.${dialog.scope}`)}
          busy={actions.extend.isPending}
          onClose={onClose}
          onConfirm={(input) =>
            actions.extend.mutate({ ids: liveAttempts(dialog.ids), scope: dialog.scope, ...input })
          }
        />
      );
    case 'force': {
      // Chỉ những người đang làm mới Buộc nộp được; hộp nêu đúng những người này.
      const people = dialog.ids.flatMap((id) => {
        const person = byId.get(id);
        return person && liveAttempts([id]).length > 0 ? [person] : [];
      });
      return (
        <ForceDialog
          people={people}
          scope={dialog.scope}
          scopeLabel={t(`monitor.scope.${dialog.scope}`)}
          totalItems={totalItems}
          busy={actions.force.isPending}
          onClose={onClose}
          onConfirm={() =>
            actions.force.mutate({ ids: liveAttempts(dialog.ids), scope: dialog.scope })
          }
        />
      );
    }
    case 'undo':
      return (
        <UndoDialog
          people={undoPeople}
          secondsLeft={undoLeft}
          busy={actions.undo.isPending || actions.undoAll.isPending}
          onClose={onClose}
          onConfirm={() =>
            undoPeople.length === 1 && undoPeople[0]
              ? actions.undo.mutate(undoPeople[0].userId)
              : actions.undoAll.mutate()
          }
        />
      );
    case 'warn':
    case 'suspend': {
      if (!target) return null;
      const warning = dialog.kind === 'warn';
      return (
        <ReasonDialog
          title={t(`monitor.${dialog.kind}.title`)}
          body={t(`monitor.${dialog.kind}.body`, { name: target.fullName })}
          confirmLabel={t(`monitor.${dialog.kind}.confirm`)}
          danger={!warning}
          required
          maxLength={VIOLATION_REASON_MAX}
          busy={actions.violation.isPending}
          onClose={onClose}
          onConfirm={(reason) =>
            actions.violation.mutate({
              userId: target.userId,
              action: warning ? 'warning' : 'disqualify',
              reason,
            })
          }
        />
      );
    }
    case 'revoke':
      if (!target) return null;
      return (
        <ReasonDialog
          title={t('monitor.revoke.title')}
          body={t('monitor.revoke.body', { name: target.fullName })}
          confirmLabel={t('monitor.revoke.confirm')}
          danger
          required={false}
          maxLength={REVOKE_REASON_MAX}
          busy={actions.revoke.isPending}
          onClose={onClose}
          onConfirm={(reason) => actions.revoke.mutate({ userId: target.userId, reason })}
        />
      );
    case 'pardon':
      if (!target) return null;
      return (
        <ConfirmDialog
          title={t('monitor.pardon.title')}
          busy={actions.pardon.isPending}
          confirmLabel={t('monitor.pardon.confirm')}
          onClose={onClose}
          onConfirm={() => actions.pardon.mutate(target.userId)}
        >
          {t('monitor.pardon.body', { name: target.fullName })}
        </ConfirmDialog>
      );
    case 'entry':
      return (
        <ConfirmDialog
          title={t(entryClosed ? 'monitor.entry.reopenTitle' : 'monitor.entry.closeTitle')}
          busy={actions.entry.isPending}
          confirmLabel={t(entryClosed ? 'monitor.entry.reopen' : 'monitor.entry.close')}
          onClose={onClose}
          onConfirm={() => actions.entry.mutate()}
        >
          {entryClosed
            ? t('monitor.entry.reopenBody')
            : t('monitor.entry.closeBody', { count: notStarted })}
        </ConfirmDialog>
      );
  }
}
