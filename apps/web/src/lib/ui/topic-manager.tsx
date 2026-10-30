import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  archiveTopic,
  createTopic,
  deleteTopic,
  restoreTopic,
  type Topic,
  topicsQuery,
  updateTopic,
} from '../question-bank';
import { Badge, Button, Dialog, ErrorMessage, PrimaryButton, TextField } from '.';
import { useToast } from './toast';

/** Quản lý Chủ đề: thêm, đổi tên, Lưu trữ / Khôi phục, xóa Chủ đề rỗng (docs/plan/slice-2.md, Q112). */
export function TopicManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const topics = useQuery({ ...topicsQuery(true), enabled: open });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['topics'] });
  const add = useMutation({
    mutationFn: () => createTopic({ name }),
    onSuccess: async () => {
      setName('');
      await refresh();
      toast(t('questionBank.topicAdded'));
    },
  });
  const rename = useMutation({
    mutationFn: (value: { id: string; name: string }) =>
      updateTopic(value.id, { name: value.name }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: (topic: Topic) =>
      topic.archivedAt ? restoreTopic(topic.id) : archiveTopic(topic.id),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (topic: Topic) => deleteTopic(topic.id),
    onSuccess: refresh,
  });

  const error = add.error ?? rename.error ?? archive.error ?? remove.error;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) add.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('questionBank.manageTopics')}>
      <form className="flex items-end gap-2" onSubmit={submit}>
        <div className="flex-1">
          <TextField
            id="new-topic-name"
            label={t('questionBank.topicName')}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <PrimaryButton type="submit" disabled={!name.trim() || add.isPending}>
          {t('questionBank.addTopic')}
        </PrimaryButton>
      </form>
      <ErrorMessage>{error && errorMessage(t, error)}</ErrorMessage>
      {topics.data?.length === 0 && (
        <p className="text-sm text-fg-muted">{t('questionBank.noTopics')}</p>
      )}
      <ul className="flex flex-col gap-2">
        {topics.data?.map((topic) => (
          <li key={topic.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            {editing?.id === topic.id ? (
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename.mutate(editing);
                }}
              >
                <div className="flex-1">
                  <TextField
                    id={`rename-${topic.id}`}
                    label={t('questionBank.topicName')}
                    maxLength={100}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: topic.id, name: e.target.value })}
                  />
                </div>
                <PrimaryButton type="submit" disabled={!editing.name.trim() || rename.isPending}>
                  {t('common.done')}
                </PrimaryButton>
                <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{topic.name}</span>
                  <span className="text-sm text-fg-muted tabular-nums">
                    {t('questionBank.questionCount', { count: topic.questionCount ?? 0 })}
                  </span>
                  {topic.archivedAt && <Badge>{t('questionBank.archived')}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setEditing({ id: topic.id, name: topic.name })}>
                    <Pencil aria-hidden className="size-4" />
                    {t('questionBank.rename')}
                  </Button>
                  <Button onClick={() => archive.mutate(topic)}>
                    {topic.archivedAt ? (
                      <ArchiveRestore aria-hidden className="size-4" />
                    ) : (
                      <Archive aria-hidden className="size-4" />
                    )}
                    {topic.archivedAt ? t('questionBank.restore') : t('questionBank.archive')}
                  </Button>
                  <Button
                    variant="danger-ghost"
                    disabled={(topic.questionCount ?? 0) > 0}
                    title={
                      (topic.questionCount ?? 0) > 0
                        ? t('questionBank.deleteTopicBlocked')
                        : undefined
                    }
                    onClick={() => remove.mutate(topic)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {t('questionBank.delete')}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <Button onClick={onClose}>{t('common.close')}</Button>
    </Dialog>
  );
}
