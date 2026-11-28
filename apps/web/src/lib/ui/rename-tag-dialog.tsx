import { normalizeTag, TAG_MAX_CHARS } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import { renameQuestionTag } from '../question-bank';
import type { TagCount } from '../tag-facets';
import { Button, Dialog, ErrorMessage, PrimaryButton, TextField } from '.';
import { useToast } from './toast';

/**
 * Đổi tên một tag; đổi sang tên đã có là gộp. Mặc định chỉ trong Chủ đề đang chọn, muốn mọi Chủ đề phải chọn rõ
 * (Q522). Trước khi đổi luôn cho biết số câu sẽ đổi.
 */
export function RenameTagDialog({
  from,
  topicId,
  counts,
  onClose,
  onRenamed,
}: {
  from: string;
  topicId: string | undefined;
  /** Tag đang có trong phạm vi đang xem, để báo trước khi hai tag sẽ gộp. */
  counts: readonly TagCount[];
  onClose: () => void;
  onRenamed: (to: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'topic' | 'all' | null>(topicId ? 'topic' : null);
  const to = normalizeTag(name);
  const valid = to !== '' && to !== from && to.length <= TAG_MAX_CHARS && !to.includes(',');
  // Chờ gõ xong một nhịp rồi mới hỏi số câu.
  const [asked, setAsked] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setAsked(valid ? to : ''), 250);
    return () => clearTimeout(timer);
  }, [to, valid]);

  const body = { from, to, topicId: scope === 'topic' ? topicId : undefined };
  const preview = useQuery({
    queryKey: ['questions', 'rename-preview', from, asked, scope, topicId],
    queryFn: () => renameQuestionTag({ ...body, to: asked, dryRun: true }),
    enabled: asked !== '' && scope !== null,
  });
  const affected = asked === to ? preview.data?.changed : undefined;
  const rename = useMutation({
    mutationFn: () => renameQuestionTag(body),
    onSuccess: async ({ changed }) => {
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast(t('renameTag.done', { count: changed }));
      onRenamed(to);
    },
  });
  const merging = valid && counts.some((row) => row.tag === to);
  const scopes = [...(topicId ? (['topic'] as const) : []), 'all' as const];

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('renameTag.title', { tag: from })}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <PrimaryButton
            disabled={!valid || scope === null || !affected || rename.isPending}
            onClick={() => rename.mutate()}
          >
            {t('renameTag.confirm')}
          </PrimaryButton>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      }
    >
      <TextField
        id="rename-tag"
        label={t('renameTag.newName')}
        value={name}
        maxLength={TAG_MAX_CHARS}
        autoCapitalize="none"
        autoComplete="off"
        error={name.includes(',') && t('renameTag.noComma')}
        onChange={(e) => setName(e.target.value)}
      />
      <fieldset className="flex flex-col">
        <legend className="pb-1 text-sm font-medium">{t('renameTag.scope')}</legend>
        {scopes.map((value) => (
          <label
            key={value}
            className="flex min-h-12 cursor-pointer items-center gap-3 text-sm pointer-fine:min-h-8"
          >
            <input
              type="radio"
              name="rename-scope"
              className="size-4"
              checked={scope === value}
              onChange={() => setScope(value)}
            />
            {t(value === 'topic' ? 'renameTag.thisTopic' : 'renameTag.allTopics')}
          </label>
        ))}
      </fieldset>
      <div role="status" className="flex flex-col gap-1 text-sm">
        {affected !== undefined && <p>{t('renameTag.preview', { count: affected })}</p>}
        {merging && <p className="text-warning">{t('renameTag.merge', { tag: to })}</p>}
      </div>
      <ErrorMessage>{rename.isError && errorMessage(t, rename.error)}</ErrorMessage>
    </Dialog>
  );
}
