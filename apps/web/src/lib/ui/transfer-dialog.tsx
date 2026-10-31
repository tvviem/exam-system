import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OwnedCounts, removeUser, transferTopics, userContentQuery } from '../admin';
import { errorMessage } from '../errors';
import { Button, Dialog, ErrorMessage } from '.';
import { RecipientPicker } from './recipient-picker';

/**
 * Hộp thoại chọn người nhận, dùng chung cho Chuyển giao (`mode="transfer"`, có danh sách Chủ đề đang chọn) và cho
 * Xóa người dùng còn Chủ đề (`mode="remove"`: chuyển toàn bộ rồi Xóa cùng lúc), Q150–Q151.
 */
export function TransferDialog({
  open,
  onClose,
  user,
  mode,
  topicIds,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; fullName: string };
  mode: 'transfer' | 'remove';
  /** Chỉ dùng khi `mode="transfer"`. */
  topicIds?: string[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState<{ counts: OwnedCounts; name: string } | null>(null);

  const scope = mode === 'transfer' ? topicIds : undefined;
  const content = useQuery({ ...userContentQuery(user.id, scope), enabled: open });
  const counts = content.data?.selected ?? content.data?.totals;

  const run = useMutation({
    mutationFn: async (recipientId: string): Promise<OwnedCounts> => {
      if (mode === 'transfer') return transferTopics(user.id, topicIds ?? [], recipientId);
      const topics = content.data?.totals.topics ?? 0;
      const questions = content.data?.totals.questions ?? 0;
      await removeUser(user.id, recipientId);
      return { topics, questions, illustrations: content.data?.totals.illustrations ?? 0 };
    },
    onSuccess: async (result) => {
      setDone({ counts: result, name: recipient?.name ?? '' });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const close = () => {
    onClose();
    setRecipient(null);
    setDone(null);
    run.reset();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        mode === 'remove'
          ? t('admin.transfer.titleRemove', { name: user.fullName })
          : t('admin.transfer.title', { name: user.fullName })
      }
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 text-success" role="status">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0" />
            {mode === 'remove'
              ? t('admin.transfer.doneRemove', { topics: done.counts.topics, name: done.name })
              : t('admin.transfer.doneTransfer', {
                  topics: done.counts.topics,
                  questions: done.counts.questions,
                  name: done.name,
                })}
          </p>
          <Button onClick={close}>{t('admin.transfer.close')}</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (recipient) run.mutate(recipient.id);
          }}
        >
          {mode === 'remove' && <p className="text-fg-muted">{t('admin.transfer.removeIntro')}</p>}
          <p className="font-medium" aria-live="polite">
            {counts
              ? t('admin.transfer.summary', {
                  topics: counts.topics,
                  questions: counts.questions,
                  images: counts.illustrations,
                })
              : t('admin.transfer.summaryLoading')}
          </p>
          <RecipientPicker
            donorId={user.id}
            value={recipient?.id ?? null}
            onChange={(id, name) => setRecipient({ id, name })}
          />
          <p className="text-sm text-fg-muted">
            {t('admin.transfer.renameNote', { name: user.fullName })}
          </p>
          <ErrorMessage>{run.isError && errorMessage(t, run.error)}</ErrorMessage>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={close}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              variant={mode === 'remove' ? 'danger' : 'primary'}
              disabled={!recipient || !counts || run.isPending}
            >
              {run.isPending
                ? t('admin.transfer.working')
                : mode === 'remove'
                  ? t('admin.transfer.confirmRemove')
                  : t('admin.transfer.confirm')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
