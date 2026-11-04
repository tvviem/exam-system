import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import {
  extendTime,
  forceSubmit,
  type MonitorPerson,
  monitorQueryKey,
  pardonDevice,
  recordViolation,
  revokeDevice,
  setEntryClosed,
} from '../../monitor';
import { useToast } from '../toast';

export type Scope = 'one' | 'group' | 'all';

/**
 * Các thao tác của Người ra đề trên màn Theo dõi (Q254–Q260): mỗi thao tác một mutation; thành công thì báo, làm mới số
 * liệu và gọi `onDone` (đóng hộp thoại); lỗi thì báo ngay bằng thông điệp tiếng Việt của mã lỗi.
 */
export function useMonitorActions(options: {
  sessionId: string;
  byId: ReadonlyMap<string, MonitorPerson>;
  entryClosed: boolean;
  onDone: () => void;
  onGroupForced: () => void;
}) {
  const { sessionId, byId, entryClosed } = options;
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const done = (message: string) => {
    toast(message);
    options.onDone();
    void queryClient.invalidateQueries({ queryKey: monitorQueryKey(sessionId) });
  };
  const fail = (error: unknown) => toast(errorMessage(t, error), 'error');

  const extend = useMutation({
    mutationFn: (input: {
      ids: string[];
      scope: Scope;
      minutes: number;
      reason: string;
      batchId: string;
    }) =>
      extendTime(sessionId, {
        ...(input.scope === 'all' ? { scope: 'all' as const } : { attemptIds: input.ids }),
        minutes: input.minutes,
        reason: input.reason,
        batchId: input.batchId,
      }),
    onSuccess: (result, input) =>
      done(t('monitor.toast.extended', { minutes: input.minutes, count: result.extended })),
    onError: fail,
  });
  const force = useMutation({
    mutationFn: (input: { ids: string[]; scope: Scope }) =>
      forceSubmit(sessionId, input.scope === 'all' ? { scope: 'all' } : { attemptIds: input.ids }),
    onSuccess: (result, input) => {
      done(t('monitor.toast.forced', { count: result.closed }));
      if (input.scope === 'group') options.onGroupForced();
    },
    onError: fail,
  });
  const violation = useMutation({
    mutationFn: (input: { userId: string; action: 'warning' | 'disqualify'; reason: string }) => {
      const attemptId = byId.get(input.userId)?.attemptId;
      if (!attemptId) throw new Error('Người này chưa có Lượt làm bài');
      return recordViolation(sessionId, attemptId, { action: input.action, reason: input.reason });
    },
    onSuccess: (_result, input) =>
      done(t(input.action === 'warning' ? 'monitor.toast.warned' : 'monitor.toast.suspended')),
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (input: { userId: string; reason: string }) =>
      revokeDevice(sessionId, input.userId, input.reason),
    onSuccess: () => done(t('monitor.toast.revoked')),
    onError: fail,
  });
  const pardon = useMutation({
    mutationFn: (userId: string) => {
      const deviceId = byId.get(userId)?.revokedDeviceId;
      if (!deviceId) throw new Error('Người này không có thiết bị bị thu hồi');
      return pardonDevice(sessionId, userId, deviceId);
    },
    onSuccess: () => done(t('monitor.toast.pardoned')),
    onError: fail,
  });
  const entry = useMutation({
    mutationFn: () => setEntryClosed(sessionId, !entryClosed),
    onSuccess: () => done(t(entryClosed ? 'monitor.toast.reopened' : 'monitor.toast.closed')),
    onError: fail,
  });
  return { extend, force, violation, revoke, pardon, entry };
}

export type MonitorActions = ReturnType<typeof useMonitorActions>;
