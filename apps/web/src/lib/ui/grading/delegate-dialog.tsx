import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import {
  delegateCandidatesQuery,
  delegateQuery,
  grantDelegate,
  revokeDelegate,
} from '../../grading';
import { Button, Dialog, ErrorMessage, SearchField } from '..';
import { useToast } from '../toast';

/**
 * Ủy quyền chấm (Q307): chủ Phiên thi hoặc Quản trị viên chọn một Người ra đề khác (không có tên trong Danh sách dự thi) để
 * chấm và Công bố thay khi có sự cố. `admin` dùng đường dẫn của Quản trị viên.
 */
export function DelegateDialog({
  sessionId,
  admin = false,
  open,
  onClose,
}: {
  sessionId: string;
  admin?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const current = useQuery({ ...delegateQuery(sessionId, admin), enabled: open });
  const candidates = useQuery({ ...delegateCandidatesQuery(sessionId, q, admin), enabled: open });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['grading', sessionId] });
  const grant = useMutation({
    mutationFn: (userId: string) => grantDelegate(sessionId, userId, admin),
    onSuccess: () => {
      toast(t('grading.delegate.granted'));
      void refresh();
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  const revoke = useMutation({
    mutationFn: () => revokeDelegate(sessionId, admin),
    onSuccess: () => {
      toast(t('grading.delegate.revoked'));
      void refresh();
    },
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });
  const delegate = current.data?.delegate;
  return (
    <Dialog open={open} onClose={onClose} title={t('grading.delegate.title')}>
      <p className="text-sm text-fg-muted">{t('grading.delegate.hint')}</p>
      {delegate ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
          <p>
            <span className="text-sm text-fg-muted">{t('grading.delegate.current')}</span>
            <br />
            <strong>{delegate.fullName ?? '—'}</strong>
            {delegate.code ? ` (${delegate.code})` : ''}
          </p>
          <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate()}>
            {t('grading.delegate.revoke')}
          </Button>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong p-3 text-sm text-fg-muted">
          {t('grading.delegate.none')}
        </p>
      )}
      <SearchField
        id="delegate-search"
        label={t('grading.delegate.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {candidates.isError && <ErrorMessage>{errorMessage(t, candidates.error)}</ErrorMessage>}
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
        {(candidates.data?.items ?? []).map((person) => (
          <li
            key={person.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-border/40"
          >
            <span className="min-w-0 truncate text-sm">
              {person.fullName}
              {person.code ? ` · ${person.code}` : ''}
            </span>
            <Button
              loading={grant.isPending && grant.variables === person.id}
              onClick={() => grant.mutate(person.id)}
            >
              {t('grading.delegate.grant')}
            </Button>
          </li>
        ))}
        {candidates.data?.items.length === 0 && (
          <li className="text-sm text-fg-muted">{t('grading.delegate.noCandidates')}</li>
        )}
      </ul>
    </Dialog>
  );
}
