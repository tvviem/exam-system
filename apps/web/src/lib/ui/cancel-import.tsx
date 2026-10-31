import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import { cancelImport } from '../question-imports';
import { Button, Dialog, ErrorMessage } from '.';

/** Nút "Hủy lô" kèm hộp xác nhận (Q155): xóa lô chờ xác nhận hoặc lô đọc lỗi để sửa file rồi tải lại. */
export function CancelImportButton({
  batchId,
  className,
  onCancelled,
}: {
  batchId: string;
  className?: string;
  onCancelled?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelImport(batchId),
    onSuccess: async () => {
      // Lô đã mất: bỏ khỏi bộ nhớ đệm thay vì nạp lại (sẽ nhận 404), chỉ làm mới danh sách.
      queryClient.removeQueries({ queryKey: ['question-imports', 'detail', batchId] });
      queryClient.removeQueries({ queryKey: ['question-imports', 'items', batchId] });
      await queryClient.invalidateQueries({ queryKey: ['question-imports', 'list'] });
      setOpen(false);
      onCancelled?.();
    },
  });

  return (
    <>
      <Button variant="danger-ghost" className={className} onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-5" />
        {t('questionImport.cancel')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('questionImport.cancelTitle')}>
        <p>{t('questionImport.cancelBody')}</p>
        <ErrorMessage>{cancel.isError && errorMessage(t, cancel.error)}</ErrorMessage>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending ? t('questionImport.cancelling') : t('questionImport.cancel')}
          </Button>
          <Button onClick={() => setOpen(false)}>{t('questionImport.keepBatch')}</Button>
        </div>
      </Dialog>
    </>
  );
}
