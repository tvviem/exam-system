import type { RichText } from '@exam/shared';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addOption,
  addStatement,
  type Draft,
  defaultLadder,
  MAX_OPTIONS,
  MAX_STATEMENTS,
  MIN_OPTIONS,
  type problemsOf,
  removeOption,
  removeStatement,
} from '../question-draft';
import { Button, Card, SelectField, TextField } from '.';

// Các ô soạn theo từng Loại câu hỏi, tách khỏi trình soạn để file chính chỉ lo luồng lưu và bản nháp.
// TipTap tải lười để không nặng trang danh sách.
const RichTextEditor = lazy(() => import('./rich-text-editor'));

/** A, B, C… cho Phương án; a, b, c… cho Mệnh đề. */
export const optionLetter = (index: number) => String.fromCharCode(65 + index);
export const statementLetter = (index: number) => String.fromCharCode(97 + index);

export function Rich({
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

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
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

export function ChoiceFields({
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
                  {t('questionBank.optionLabel', { letter: optionLetter(index) })}
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
                label={t('questionBank.optionLabel', { letter: optionLetter(index) })}
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

export function ClusterFields({
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
                  {t('questionBank.statementKey', { letter: statementLetter(index) })}
                </legend>
                <span aria-hidden className="text-sm font-semibold">
                  {statementLetter(index)})
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
              label={t('questionBank.statementLabel', { letter: statementLetter(index) })}
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

export function EssayFields({
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
