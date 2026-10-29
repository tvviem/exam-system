import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { Copy, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api';
import { errorMessage } from '../errors';
import {
  createQuestion,
  deleteQuestions,
  duplicateQuestion,
  QUESTION_TYPES,
  type Question,
  type QuestionType,
  questionQuery,
  topicsQuery,
  updateQuestion,
} from '../question-bank';
import { type Draft, draftFromQuestion, emptyDraft, problemsOf, toInput } from '../question-draft';
import { Button, Card, Dialog, ErrorMessage, PrimaryButton, SelectField, TextField } from '.';
import { Breadcrumb } from './breadcrumb';
import { PageHeader } from './page-header';
import {
  ChoiceFields,
  ClusterFields,
  EssayFields,
  FieldLabel,
  Rich,
} from './question-editor-fields';
import { QuestionView } from './question-view';
import { StickyActionBar } from './sticky-action-bar';
import { Tabs } from './tabs';
import { useToast } from './toast';

// Trình soạn Câu hỏi (docs/plan/slice-2.md, Q119): lưu bằng nút, cảnh báo khi rời trang đang sửa dở,
// bản đang soạn nhớ trên thiết bị. TipTap tải lười để không nặng trang danh sách.
const storageKeyOf = (question: Question | undefined) =>
  `exam.draft.question.${question?.id ?? 'new'}`;

function readStored(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeStored(key: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Chế độ riêng tư hoặc hết dung lượng: bỏ qua, trình soạn vẫn dùng được.
  }
}

const serialize = (draft: Draft) => JSON.stringify(toInput(draft));

export function QuestionEditor({
  question,
  initialType,
  initialTopicId,
}: {
  question?: Question;
  initialType?: QuestionType;
  initialTopicId?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const topics = useQuery(topicsQuery(true));

  const initial = useRef<Draft>(
    question
      ? draftFromQuestion(question)
      : emptyDraft(initialType ?? 'single_choice', initialTopicId ?? ''),
  );
  const [baseline, setBaseline] = useState(() => serialize(initial.current));
  const [version, setVersion] = useState(question?.version ?? 0);
  const [draft, setDraft] = useState<Draft>(initial.current);
  // Đổi `formKey` để dựng lại các ô soạn khi nạp nội dung khác (khôi phục bản nháp, tải lại bản mới).
  const [formKey, setFormKey] = useState(0);
  const [tab, setTab] = useState('edit');
  const [showAnswer, setShowAnswer] = useState(true);
  const [tagsText, setTagsText] = useState(draft.tags.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const storageKey = storageKeyOf(question);
  const [stored, setStored] = useState<Draft | null>(null);

  const dirty = serialize(draft) !== baseline;
  const problems = problemsOf(draft);
  const skipBlock = useRef(false);

  // Câu mới chưa có Chủ đề thì mặc định Chủ đề đầu tiên chưa lưu trữ; đây là giá trị gốc, không tính là thay đổi.
  const activeTopics = (topics.data ?? []).filter(
    (topic) => !topic.archivedAt || topic.id === draft.topicId,
  );
  const firstTopicId = activeTopics[0]?.id;
  useEffect(() => {
    if (draft.topicId || !firstTopicId) return;
    initial.current = { ...initial.current, topicId: firstTopicId };
    setBaseline(serialize(initial.current));
    setDraft((d) => (d.topicId ? d : { ...d, topicId: firstTopicId }));
  }, [draft.topicId, firstTopicId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ kiểm tra bản nháp lúc mở trang
  useEffect(() => {
    const saved = readStored(storageKey);
    if (saved && serialize(saved) !== baseline) setStored(saved);
  }, []);

  useEffect(() => {
    if (stored) return; // chưa trả lời câu hỏi khôi phục thì chưa ghi đè bản nháp cũ
    const timer = setTimeout(() => writeStored(storageKey, dirty ? draft : null), 400);
    return () => clearTimeout(timer);
  }, [draft, dirty, storageKey, stored]);

  useBlocker({
    shouldBlockFn: () =>
      dirty && !skipBlock.current && !window.confirm(t('questionBank.leaveConfirm')),
    enableBeforeUnload: () => dirty && !skipBlock.current,
  });

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));

  const save = useMutation({
    mutationFn: () =>
      question
        ? updateQuestion(question.id, toInput(draft), version)
        : createQuestion(toInput(draft)),
    onSuccess: async (saved) => {
      writeStored(storageKey, null);
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      await queryClient.invalidateQueries({ queryKey: ['topics'] });
      toast(t('questionBank.saved'));
      if (question) {
        queryClient.setQueryData(['questions', 'detail', saved.id], saved);
        setBaseline(serialize(draftFromQuestion(saved)));
        setVersion(saved.version);
      } else {
        skipBlock.current = true;
        await navigate({ to: '/examiner/questions/$questionId', params: { questionId: saved.id } });
      }
    },
  });

  const reload = async () => {
    if (!question) return;
    const fresh = await queryClient.fetchQuery({ ...questionQuery(question.id), staleTime: 0 });
    const next = draftFromQuestion(fresh);
    setDraft(next);
    setTagsText(next.tags.join(', '));
    setBaseline(serialize(next));
    setVersion(fresh.version);
    setFormKey((k) => k + 1);
    save.reset();
  };

  const duplicate = useMutation({
    mutationFn: () => duplicateQuestion((question as Question).id),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast(t('questionBank.duplicated'));
      await navigate({ to: '/examiner/questions/$questionId', params: { questionId: copy.id } });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteQuestions([(question as Question).id]),
    onSuccess: async () => {
      writeStored(storageKey, null);
      skipBlock.current = true;
      await queryClient.invalidateQueries({ queryKey: ['questions'] });
      await queryClient.invalidateQueries({ queryKey: ['topics'] });
      toast(t('questionBank.deleted'));
      await navigate({ to: '/examiner/questions' });
    },
  });

  const conflict = save.error instanceof ApiError && save.error.code === 'CONFLICT';
  const topicName = topics.data?.find((topic) => topic.id === draft.topicId)?.name;

  const restore = () => {
    if (!stored) return;
    setDraft(stored);
    setTagsText(stored.tags.join(', '));
    setFormKey((k) => k + 1);
    setStored(null);
  };
  const discardStored = () => {
    writeStored(storageKey, null);
    setStored(null);
  };

  const form = (
    <div key={formKey} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="q-topic"
            label={t('questionBank.topic')}
            value={draft.topicId}
            onChange={(e) => patch({ topicId: e.target.value })}
            error={problems.includes('topic') && t('questionBank.problem.topic')}
          >
            {activeTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="q-type"
            label={t('questionBank.type')}
            value={draft.type}
            onChange={(e) => patch({ type: e.target.value as QuestionType })}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`questionType.${type}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            id="q-points"
            label={t('questionBank.defaultPoints')}
            type="number"
            inputMode="decimal"
            min={0.25}
            max={100}
            step={0.25}
            value={draft.defaultPoints}
            onChange={(e) => patch({ defaultPoints: Number(e.target.value) })}
            error={problems.includes('points') && t('questionBank.problem.points')}
          />
          <TextField
            id="q-tags"
            label={t('questionBank.tags')}
            hint={t('questionBank.tagsHint')}
            value={tagsText}
            onChange={(e) => {
              setTagsText(e.target.value);
              patch({
                tags: e.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              });
            }}
            error={problems.includes('tags') && t('questionBank.problem.tags')}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <FieldLabel htmlFor="stem">{t('questionBank.stem')}</FieldLabel>
        <Rich
          id="stem"
          label={t('questionBank.stem')}
          value={draft.stem}
          onChange={(stem) => patch({ stem })}
          invalid={problems.includes('stem')}
          minHeight="min-h-32"
        />
        {problems.includes('stem') && (
          <p className="text-sm text-danger">{t('questionBank.problem.stem')}</p>
        )}
      </Card>

      {(draft.type === 'single_choice' || draft.type === 'multiple_choice') && (
        <ChoiceFields draft={draft} setDraft={setDraft} problems={problems} />
      )}
      {draft.type === 'true_false_cluster' && (
        <ClusterFields draft={draft} setDraft={setDraft} problems={problems} />
      )}
      {draft.type === 'essay' && <EssayFields draft={draft} patch={patch} problems={problems} />}
    </div>
  );

  const preview = (
    <Card className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--app-header-h)+1rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('questionBank.preview')}</h2>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9">
          <input
            type="checkbox"
            className="size-5"
            checked={showAnswer}
            onChange={(e) => setShowAnswer(e.target.checked)}
          />
          {t('questionBank.showAnswer')}
        </label>
      </div>
      <QuestionView question={toInput(draft)} showAnswer={showAnswer} />
    </Card>
  );

  return (
    <section className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('questionBank.title'), to: '/examiner/questions' },
          ...(topicName
            ? [
                {
                  label: topicName,
                  to: '/examiner/questions',
                  search: { topicId: draft.topicId },
                },
              ]
            : []),
          { label: question ? t('questionBank.editQuestion') : t('questionBank.newQuestion') },
        ]}
      />
      <PageHeader
        title={question ? t('questionBank.editQuestion') : t('questionBank.newQuestion')}
        actions={
          question && (
            <div className="flex gap-2">
              <Button disabled={dirty || duplicate.isPending} onClick={() => duplicate.mutate()}>
                <Copy aria-hidden className="size-5" />
                {t('questionBank.duplicate')}
              </Button>
              <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden className="size-5" />
                {t('questionBank.delete')}
              </Button>
            </div>
          )
        }
      />

      {stored && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-warning bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm">{t('questionBank.restorePrompt')}</p>
          <div className="flex gap-2">
            <PrimaryButton onClick={restore}>{t('questionBank.restore')}</PrimaryButton>
            <Button onClick={discardStored}>{t('questionBank.discardDraft')}</Button>
          </div>
        </div>
      )}

      <Tabs
        split
        label={t('questionBank.editorTabs')}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'edit', label: t('questionBank.tabEdit'), content: form },
          { id: 'preview', label: t('questionBank.tabPreview'), content: preview },
        ]}
      />

      <StickyActionBar>
        {conflict ? (
          <div className="flex flex-col gap-2">
            <ErrorMessage>{t('questionBank.versionConflict')}</ErrorMessage>
            <Button onClick={reload}>{t('questionBank.reload')}</Button>
          </div>
        ) : (
          <ErrorMessage>
            {save.isError
              ? errorMessage(t, save.error)
              : problems.length > 0 &&
                t('questionBank.fixBeforeSave', {
                  problems: problems.map((p) => t(`questionBank.problemShort.${p}`)).join(', '),
                })}
          </ErrorMessage>
        )}
        <PrimaryButton
          disabled={problems.length > 0 || !dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save aria-hidden className="size-5" />
          {save.isPending ? t('questionBank.saving') : t('questionBank.save')}
        </PrimaryButton>
      </StickyActionBar>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('questionBank.deleteTitle')}
      >
        <p>{t('questionBank.deleteBody')}</p>
        <ErrorMessage>{remove.isError && errorMessage(t, remove.error)}</ErrorMessage>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('questionBank.delete')}
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>
    </section>
  );
}
