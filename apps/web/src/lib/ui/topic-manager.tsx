import { normalizeForSearch } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
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
import { Button, Dialog, ErrorMessage, PrimaryButton, SearchField, TextField } from '.';
import { RowMenu } from './row-menu';
import { useToast } from './toast';

/**
 * Quản lý Chủ đề: thêm, đổi tên, Lưu trữ / Khôi phục, xóa Chủ đề rỗng (docs/plan/slice-2.md, Q112).
 * Nhiều Chủ đề vẫn dùng được: mỗi Chủ đề một dòng gọn với menu "…", tìm không dấu, tách "Đang dùng" và "Đã lưu trữ",
 * danh sách có vùng cuộn riêng nên ô thêm và ô tìm luôn nằm trong tầm mắt.
 */
export function TopicManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const topics = useQuery({ ...topicsQuery(true), enabled: open });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');

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

  const counts = useMemo(() => {
    const all = topics.data ?? [];
    return {
      active: all.filter((topic) => !topic.archivedAt).length,
      archived: all.filter((topic) => topic.archivedAt).length,
    };
  }, [topics.data]);
  const shown = useMemo(() => {
    const needle = normalizeForSearch(query);
    return (topics.data ?? []).filter(
      (topic) =>
        Boolean(topic.archivedAt) === (view === 'archived') &&
        normalizeForSearch(topic.name).includes(needle),
    );
  }, [topics.data, view, query]);

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
      <p className="text-sm text-fg-muted">{t('questionBank.topicIntro')}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:flex-1">
          <SearchField
            id="topic-search"
            label={t('questionBank.searchTopics')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1 sm:w-72 sm:shrink-0">
          <legend className="sr-only">{t('questionBank.topicView')}</legend>
          {(['active', 'archived'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`min-h-12 cursor-pointer rounded-md px-3 text-sm font-medium pointer-fine:min-h-9 ${
                view === value
                  ? 'bg-surface text-on-primary-soft shadow-sm'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              {value === 'active'
                ? t('questionBank.topicActive')
                : t('questionBank.topicArchivedGroup')}{' '}
              <span className="tabular-nums">({counts[value]})</span>
            </button>
          ))}
        </fieldset>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">
          {query.trim()
            ? t('questionBank.noTopicMatch', { q: query.trim() })
            : view === 'archived'
              ? t('questionBank.noArchivedTopics')
              : t('questionBank.noTopics')}
        </p>
      ) : (
        <ul className="-mx-1 flex max-h-[40dvh] flex-col overflow-y-auto px-1 sm:max-h-[min(24rem,50dvh)]">
          {shown.map((topic) => (
            <li key={topic.id} className="border-b border-border last:border-b-0">
              {editing?.id === topic.id ? (
                <form
                  className="flex items-end gap-2 py-2"
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
                <div className="flex min-h-12 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate font-medium" title={topic.name}>
                    {topic.name}
                  </span>
                  <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                    {t('questionBank.questionCount', { count: topic.questionCount ?? 0 })}
                  </span>
                  <RowMenu
                    label={t('questionBank.topicMenu', { name: topic.name })}
                    items={[
                      {
                        label: t('questionBank.rename'),
                        icon: <Pencil aria-hidden className="size-4" />,
                        onSelect: () => setEditing({ id: topic.id, name: topic.name }),
                      },
                      {
                        label: topic.archivedAt
                          ? t('questionBank.restore')
                          : t('questionBank.archive'),
                        icon: topic.archivedAt ? (
                          <ArchiveRestore aria-hidden className="size-4" />
                        ) : (
                          <Archive aria-hidden className="size-4" />
                        ),
                        onSelect: () => archive.mutate(topic),
                      },
                      {
                        label: t('questionBank.delete'),
                        icon: <Trash2 aria-hidden className="size-4" />,
                        danger: true,
                        disabled: (topic.questionCount ?? 0) > 0,
                        hint:
                          (topic.questionCount ?? 0) > 0
                            ? t('questionBank.deleteTopicBlocked')
                            : undefined,
                        onSelect: () => remove.mutate(topic),
                      },
                    ]}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button onClick={onClose}>{t('common.close')}</Button>
    </Dialog>
  );
}
