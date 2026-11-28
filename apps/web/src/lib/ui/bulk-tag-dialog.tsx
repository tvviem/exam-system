import { compareTags } from '@exam/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import { applyQuestionTags, type QuestionListItem } from '../question-bank';
import { Button, Dialog, ErrorMessage, PrimaryButton } from '.';
import { TagInput } from './tag-input';
import { useToast } from './toast';

/** Thêm và bỏ tag cho các Câu hỏi đã chọn (docs/plan/loc-nhieu-tag-thiet-ke.md mục 4). */
export function BulkTagDialog({
  items,
  topicId,
  onClose,
  onDone,
}: {
  items: QuestionListItem[];
  /** Chủ đề đang lọc (nếu có): tag của nó được gợi ý trước. */
  topicId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const present = [...new Set(items.flatMap((item) => item.tags))].sort(compareTags);
  // Vừa thêm vừa bỏ cùng một tag thì lấy "thêm".
  const removing = remove.filter((tag) => !add.includes(tag));
  const count = items.length;
  const apply = useMutation({
    mutationFn: () =>
      applyQuestionTags(
        items.map((item) => item.id),
        add,
        removing,
      ),
    onSuccess: async ({ changed, skipped }) => {
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast(
        skipped > 0
          ? t('bulkTags.doneSkipped', { changed, skipped })
          : t('bulkTags.done', { changed }),
      );
      onDone();
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('bulkTags.title', { count })}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <PrimaryButton
            disabled={(add.length === 0 && removing.length === 0) || apply.isPending}
            onClick={() => apply.mutate()}
          >
            {t('bulkTags.apply', { count })}
          </PrimaryButton>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      }
    >
      <TagInput inline label={t('bulkTags.add')} initial={[]} topicId={topicId} onChange={setAdd} />
      <fieldset className="flex min-w-0 flex-col">
        <legend className="pb-1 text-sm font-medium">{t('bulkTags.remove')}</legend>
        {present.length === 0 && <p className="text-sm text-fg-muted">{t('bulkTags.none')}</p>}
        {present.map((tag) => (
          <label
            key={tag}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-primary-soft pointer-fine:min-h-8"
          >
            <input
              type="checkbox"
              className="size-5 shrink-0"
              aria-label={t('tagInput.remove', { tag })}
              checked={removing.includes(tag)}
              disabled={add.includes(tag)}
              onChange={() =>
                setRemove((prev) =>
                  prev.includes(tag) ? prev.filter((other) => other !== tag) : [...prev, tag],
                )
              }
            />
            <span className="min-w-0 flex-1 wrap-anywhere">{tag}</span>
            <span className="shrink-0 text-fg-muted tabular-nums">
              {items.filter((item) => item.tags.includes(tag)).length}
            </span>
          </label>
        ))}
      </fieldset>
      <ErrorMessage>{apply.isError && errorMessage(t, apply.error)}</ErrorMessage>
    </Dialog>
  );
}
