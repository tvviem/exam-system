import type { RichText } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
  topicsQuery,
  updateQuestion,
} from '../question-bank';
import {
  addOption,
  addStatement,
  type Draft,
  defaultLadder,
  draftFromQuestion,
  emptyDraft,
  MAX_OPTIONS,
  MAX_STATEMENTS,
  MIN_OPTIONS,
  problemsOf,
  removeOption,
  removeStatement,
  toInput,
} from '../question-draft';
import { Button, Card, Dialog, ErrorMessage, PrimaryButton, SelectField, TextField } from '.';
import { Breadcrumb } from './breadcrumb';
import { PageHeader } from './page-header';
import { QuestionView } from './question-view';
import { StickyActionBar } from './sticky-action-bar';
import { Tabs } from './tabs';
import { useToast } from './toast';

// Trình soạn Câu hỏi (docs/plan/slice-2.md, Q119): lưu bằng nút, cảnh báo khi rời trang đang sửa dở,
// bản đang soạn nhớ trên thiết bị. TipTap tải lười để không nặng trang danh sách.
const RichTextEditor = lazy(() => import('./rich-text-editor'));

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

function Rich({
  id,
  label,
  value,
  onChange,
  invalid,
  minHeight,
}: {
  id: string;
  label: string;
  value: RichText;
  onChange: (doc: RichText) => void;
  invalid?: boolean;
  minHeight?: string;
}) {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-lg border border-border" />}>
      <RichTextEditor
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        invalid={invalid}
        minHeight={minHeight}
      />
    </Suspense>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  );
}

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
    const fresh = await queryClient.fetchQuery({
      queryKey: ['questions', 'detail', question.id],
      queryFn: () =>
        import('../api').then((m) => m.apiFetch<Question>(`/questions/${question.id}`)),
      staleTime: 0,
    });
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

type SetDraft = React.Dispatch<React.SetStateAction<Draft>>;
type Problems = ReturnType<typeof problemsOf>;

function moveItem<T>(items: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

function RowTools({
  index,
  count,
  onMove,
  onRemove,
  removeDisabled,
}: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const { t } = useTranslation();
  const tool =
    'inline-flex size-12 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 pointer-fine:size-9';
  return (
    <div className="flex">
      <button
        type="button"
        className={tool}
        aria-label={t('questionBank.moveUp')}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ChevronUp aria-hidden className="size-5" />
      </button>
      <button
        type="button"
        className={tool}
        aria-label={t('questionBank.moveDown')}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ChevronDown aria-hidden className="size-5" />
      </button>
      <button
        type="button"
        className={`${tool} hover:text-danger`}
        aria-label={t('questionBank.removeRow')}
        disabled={removeDisabled}
        onClick={onRemove}
      >
        <Trash2 aria-hidden className="size-5" />
      </button>
    </div>
  );
}

function ChoiceFields({
  draft,
  setDraft,
  problems,
}: {
  draft: Draft;
  setDraft: SetDraft;
  problems: Problems;
}) {
  const { t } = useTranslation();
  const multiple = draft.type === 'multiple_choice';
  const toggleKey = (id: string) =>
    setDraft((d) => ({
      ...d,
      key: multiple ? (d.key.includes(id) ? d.key.filter((k) => k !== id) : [...d.key, id]) : [id],
    }));
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('questionBank.options')}</h2>
      <p className="text-sm text-fg-muted">
        {multiple ? t('questionBank.optionsHintMany') : t('questionBank.optionsHintOne')}
      </p>
      <ol className="flex flex-col gap-3">
        {draft.options.map((option, index) => {
          const checked = draft.key.includes(option.id);
          return (
            <li key={option.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm font-medium pointer-fine:min-h-9">
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name="correct-option"
                    className="size-5"
                    checked={checked}
                    onChange={() => toggleKey(option.id)}
                  />
                  {t('questionBank.optionLabel', { letter: String.fromCharCode(65 + index) })}
                  <span className="text-fg-muted">
                    {checked ? `· ${t('questionBank.correctAnswer')}` : ''}
                  </span>
                </label>
                <RowTools
                  index={index}
                  count={draft.options.length}
                  onMove={(by) =>
                    setDraft((d) => ({ ...d, options: moveItem(d.options, index, by) }))
                  }
                  onRemove={() => setDraft((d) => removeOption(d, option.id))}
                  removeDisabled={draft.options.length <= MIN_OPTIONS}
                />
              </div>
              <Rich
                id={`option-${option.id}`}
                label={t('questionBank.optionLabel', { letter: String.fromCharCode(65 + index) })}
                value={option.content}
                onChange={(content) =>
                  setDraft((d) => ({
                    ...d,
                    options: d.options.map((o) => (o.id === option.id ? { ...o, content } : o)),
                  }))
                }
                minHeight="min-h-12"
              />
            </li>
          );
        })}
      </ol>
      {problems.includes('options') && (
        <p className="text-sm text-danger">{t('questionBank.problem.options')}</p>
      )}
      {problems.includes('key') && (
        <p className="text-sm text-danger">{t('questionBank.problem.key')}</p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <Button
          disabled={draft.options.length >= MAX_OPTIONS}
          onClick={() => setDraft((d) => addOption(d))}
        >
          <Plus aria-hidden className="size-5" />
          {t('questionBank.addOption')}
        </Button>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9">
          <input
            type="checkbox"
            className="size-5"
            checked={draft.shuffleOptions}
            onChange={(e) => setDraft((d) => ({ ...d, shuffleOptions: e.target.checked }))}
          />
          {t('questionBank.shuffleOptions')}
        </label>
      </div>
      {multiple && (
        <SelectField
          id="q-choice-rule"
          label={t('questionBank.scoringRule')}
          value={draft.choiceRule}
          onChange={(e) =>
            setDraft((d) => ({ ...d, choiceRule: e.target.value as Draft['choiceRule'] }))
          }
          hint={t(`questionBank.rule.${draft.choiceRule}Hint`)}
        >
          <option value="proportional">{t('questionBank.rule.proportional')}</option>
          <option value="all_or_nothing">{t('questionBank.rule.all_or_nothing')}</option>
        </SelectField>
      )}
    </Card>
  );
}

function ClusterFields({
  draft,
  setDraft,
  problems,
}: {
  draft: Draft;
  setDraft: SetDraft;
  problems: Problems;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('questionBank.statements')}</h2>
      <ol className="flex flex-col gap-3">
        {draft.statements.map((statement, index) => (
          <li
            key={statement.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <fieldset className="flex items-center gap-4">
                <legend className="sr-only">
                  {t('questionBank.statementKey', { letter: String.fromCharCode(97 + index) })}
                </legend>
                <span aria-hidden className="text-sm font-semibold">
                  {String.fromCharCode(97 + index)})
                </span>
                {[true, false].map((value) => (
                  <label
                    key={String(value)}
                    className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9"
                  >
                    <input
                      type="radio"
                      name={`statement-${statement.id}`}
                      className="size-5"
                      checked={statement.key === value}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          statements: d.statements.map((s) =>
                            s.id === statement.id ? { ...s, key: value } : s,
                          ),
                        }))
                      }
                    />
                    {value ? t('questionBank.true') : t('questionBank.false')}
                  </label>
                ))}
              </fieldset>
              <RowTools
                index={index}
                count={draft.statements.length}
                onMove={(by) =>
                  setDraft((d) => ({ ...d, statements: moveItem(d.statements, index, by) }))
                }
                onRemove={() => setDraft((d) => removeStatement(d, statement.id))}
                removeDisabled={draft.statements.length <= 1}
              />
            </div>
            <Rich
              id={`statement-${statement.id}`}
              label={t('questionBank.statementLabel', { letter: String.fromCharCode(97 + index) })}
              value={statement.content}
              onChange={(content) =>
                setDraft((d) => ({
                  ...d,
                  statements: d.statements.map((s) =>
                    s.id === statement.id ? { ...s, content } : s,
                  ),
                }))
              }
              minHeight="min-h-12"
            />
          </li>
        ))}
      </ol>
      {problems.includes('statements') && (
        <p className="text-sm text-danger">{t('questionBank.problem.statements')}</p>
      )}
      <div>
        <Button
          disabled={draft.statements.length >= MAX_STATEMENTS}
          onClick={() => setDraft((d) => addStatement(d))}
        >
          <Plus aria-hidden className="size-5" />
          {t('questionBank.addStatement')}
        </Button>
      </div>
      <SelectField
        id="q-cluster-rule"
        label={t('questionBank.scoringRule')}
        value={draft.clusterRule}
        onChange={(e) => {
          const clusterRule = e.target.value as Draft['clusterRule'];
          setDraft((d) => ({
            ...d,
            clusterRule,
            ladder: clusterRule === 'ladder' ? defaultLadder(d.statements.length) : d.ladder,
          }));
        }}
        hint={t(`questionBank.rule.${draft.clusterRule}Hint`)}
      >
        <option value="proportional">{t('questionBank.rule.proportional')}</option>
        <option value="all_or_nothing">{t('questionBank.rule.all_or_nothing')}</option>
        <option value="ladder">{t('questionBank.rule.ladder')}</option>
      </SelectField>
      {draft.clusterRule === 'ladder' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('questionBank.ladder')}</legend>
          <p className="text-sm text-fg-muted">{t('questionBank.ladderHint')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {draft.ladder.map((value, index) => (
              <TextField
                // biome-ignore lint/suspicious/noArrayIndexKey: số ô cố định theo số Mệnh đề
                key={index}
                id={`ladder-${index}`}
                label={t('questionBank.ladderStep', { count: index })}
                type="number"
                inputMode="decimal"
                min={0}
                max={1}
                step={0.05}
                value={value}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    ladder: d.ladder.map((v, i) => (i === index ? Number(e.target.value) : v)),
                  }))
                }
              />
            ))}
          </div>
          {problems.includes('ladder') && (
            <p className="text-sm text-danger">{t('questionBank.problem.ladder')}</p>
          )}
        </fieldset>
      )}
    </Card>
  );
}

function EssayFields({
  draft,
  patch,
  problems,
}: {
  draft: Draft;
  patch: (changes: Partial<Draft>) => void;
  problems: Problems;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-4">
      <TextField
        id="q-max-length"
        label={t('questionBank.maxLength')}
        hint={t('questionBank.maxLengthHint')}
        type="number"
        inputMode="numeric"
        min={100}
        max={5000}
        step={50}
        value={draft.maxLength}
        onChange={(e) => patch({ maxLength: Number(e.target.value) })}
        error={problems.includes('maxLength') && t('questionBank.problem.maxLength')}
      />
      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="rubric">{t('questionBank.rubric')}</FieldLabel>
        <p className="text-sm text-fg-muted">{t('questionBank.rubricHint')}</p>
        <Rich
          id="rubric"
          label={t('questionBank.rubric')}
          value={draft.rubric ?? { type: 'doc', content: [{ type: 'paragraph' }] }}
          onChange={(rubric) =>
            patch({
              rubric: rubric.content.length === 1 && !rubric.content[0]?.content ? null : rubric,
            })
          }
        />
      </div>
    </Card>
  );
}
