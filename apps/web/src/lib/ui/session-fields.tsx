import {
  SESSION_ATTEMPTS_MAX,
  type SessionSettings,
  sessionEditableFields,
  sessionSettingsSchema,
} from '@exam/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { examsQuery } from '../exams';
import type { SessionInput, SessionSummary } from '../sessions';
import { isoToVnInput, vnInputToIso } from '../vn-time';
import { Button, SelectField, TextField } from '.';

/** Bản nháp trên màn hình: giờ là giá trị ô nhập (giờ Việt Nam), số là chuỗi để gõ dở không mất. */
export interface SessionDraft {
  examId: string;
  title: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: string;
  hardClose: boolean;
  maxAttempts: string;
  attemptScoring: 'highest' | 'latest';
  shuffleItems: boolean;
  shuffleOptions: boolean;
  showScoringRules: boolean;
  accessCode: string;
}

export const emptySessionDraft: SessionDraft = {
  examId: '',
  title: '',
  opensAt: '',
  closesAt: '',
  durationMinutes: '45',
  hardClose: false,
  maxAttempts: '1',
  attemptScoring: 'highest',
  shuffleItems: false,
  shuffleOptions: false,
  showScoringRules: false,
  accessCode: '',
};

export const draftOf = (session: SessionSummary): SessionDraft => ({
  examId: session.examId,
  title: session.title,
  opensAt: isoToVnInput(session.opensAt),
  closesAt: isoToVnInput(session.closesAt),
  durationMinutes: String(session.durationMinutes),
  hardClose: session.hardClose,
  maxAttempts: String(session.maxAttempts),
  attemptScoring: session.attemptScoring,
  shuffleItems: session.shuffleItems,
  shuffleOptions: session.shuffleOptions,
  showScoringRules: session.showScoringRules,
  accessCode: session.accessCode,
});

export const inputOf = (draft: SessionDraft): SessionInput => ({
  examId: draft.examId,
  title: draft.title,
  opensAt: vnInputToIso(draft.opensAt),
  closesAt: vnInputToIso(draft.closesAt),
  durationMinutes: draft.durationMinutes.trim() === '' ? Number.NaN : Number(draft.durationMinutes),
  hardClose: draft.hardClose,
  maxAttempts: Number(draft.maxAttempts),
  attemptScoring: draft.attemptScoring,
  shuffleItems: draft.shuffleItems,
  shuffleOptions: draft.shuffleOptions,
  showScoringRules: draft.showScoringRules,
  ...(draft.accessCode.trim() ? { accessCode: draft.accessCode } : {}),
});

export type SessionFieldName = keyof SessionSettings;
export type SessionGroup = 'exam' | 'times' | 'rules';

/** Trường nào thuộc bước nào của trình tạo. */
export const GROUP_FIELDS: Record<SessionGroup, SessionFieldName[]> = {
  exam: ['examId', 'title'],
  times: ['opensAt', 'closesAt', 'durationMinutes', 'hardClose'],
  rules: [
    'maxAttempts',
    'attemptScoring',
    'shuffleItems',
    'shuffleOptions',
    'showScoringRules',
    'accessCode',
  ],
};

/** Trường nào đang sai theo luật chung với server (`@exam/shared`). */
export function invalidFields(draft: SessionDraft): Set<string> {
  const result = sessionSettingsSchema.safeParse(inputOf(draft));
  return new Set(result.success ? [] : result.error.issues.map((i) => String(i.path[0])));
}

type Rules = ReturnType<typeof sessionEditableFields>;
const ALL_FREE = sessionEditableFields('upcoming');

function Check({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="inline-flex min-h-12 cursor-pointer items-center gap-3 text-base pointer-fine:min-h-9"
      >
        <input
          id={id}
          type="checkbox"
          className="size-5"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {hint && <p className="pl-8 text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

/**
 * Các trường thiết lập của một nhóm (bước của trình tạo, hoặc cả ba nhóm ở trang sửa). `rules` cho biết ô nào còn sửa
 * được (Q202); thiếu trong `rules` là bị khóa, `grow` là chỉ được kéo dài.
 */
export function SessionFields({
  group,
  draft,
  patch,
  rules = ALL_FREE,
  currentExam,
  invalid,
  onSuggestCode,
  codeBusy,
}: {
  group: SessionGroup;
  draft: SessionDraft;
  patch: (change: Partial<SessionDraft>) => void;
  rules?: Rules;
  /** Bộ đề đang gắn với Phiên thi (sửa): hiện được dù đã Lưu trữ. */
  currentExam?: { id: string; title: string };
  invalid?: Set<string>;
  onSuggestCode?: () => void;
  codeBusy?: boolean;
}) {
  const { t } = useTranslation();
  const open = (field: SessionFieldName) => rules[field] !== undefined;
  const lockedHint = (field: SessionFieldName): string | undefined =>
    rules[field] === undefined
      ? t('session.field.locked')
      : rules[field] === 'grow'
        ? t('session.field.growOnly')
        : undefined;
  const error = (field: SessionFieldName, shown: boolean) =>
    shown && invalid?.has(field) ? t(`session.invalid.${field}`) : undefined;

  const exams = useQuery({
    ...examsQuery({ status: 'published', pageSize: 100 }),
    enabled: group === 'exam',
  });

  if (group === 'exam') {
    const options = exams.data?.items ?? [];
    const hasCurrent = currentExam && !options.some((e) => e.id === currentExam.id);
    return (
      <div className="flex flex-col gap-4">
        <SelectField
          id="session-exam"
          label={t('session.field.exam')}
          hint={
            exams.isSuccess && options.length === 0 && !currentExam
              ? t('session.field.examNone')
              : (lockedHint('examId') ?? t('session.field.examHint'))
          }
          value={draft.examId}
          disabled={!open('examId')}
          onChange={(e) => patch({ examId: e.target.value })}
        >
          <option value="">{t('session.field.examPlaceholder')}</option>
          {hasCurrent && <option value={currentExam.id}>{currentExam.title}</option>}
          {options.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {t('session.field.examOption', {
                title: exam.title,
                items: exam.itemCount,
                points: exam.totalPoints,
              })}
            </option>
          ))}
        </SelectField>
        <TextField
          id="session-title"
          label={t('session.field.name')}
          value={draft.title}
          maxLength={200}
          required
          disabled={!open('title')}
          hint={lockedHint('title')}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>
    );
  }

  if (group === 'times') {
    return (
      <div className="flex flex-col gap-4">
        <TextField
          id="session-opens"
          type="datetime-local"
          label={t('session.field.opensAt')}
          hint={lockedHint('opensAt') ?? t('session.field.opensHint')}
          value={draft.opensAt}
          required
          disabled={!open('opensAt')}
          onChange={(e) => patch({ opensAt: e.target.value })}
        />
        <TextField
          id="session-closes"
          type="datetime-local"
          label={t('session.field.closesAt')}
          hint={lockedHint('closesAt') ?? t('session.field.closesHint')}
          error={error('closesAt', draft.closesAt !== '' && draft.opensAt !== '')}
          value={draft.closesAt}
          min={draft.opensAt || undefined}
          required
          disabled={!open('closesAt')}
          onChange={(e) => patch({ closesAt: e.target.value })}
        />
        <TextField
          id="session-duration"
          type="number"
          inputMode="numeric"
          label={t('session.field.duration')}
          hint={lockedHint('durationMinutes') ?? t('session.field.durationHint')}
          value={draft.durationMinutes}
          min={1}
          max={600}
          required
          disabled={!open('durationMinutes')}
          onChange={(e) => patch({ durationMinutes: e.target.value })}
        />
        <Check
          id="session-hard-close"
          label={t('session.field.hardClose')}
          hint={lockedHint('hardClose') ?? t('session.field.hardCloseHint')}
          checked={draft.hardClose}
          disabled={!open('hardClose')}
          onChange={(hardClose) => patch({ hardClose })}
        />
      </div>
    );
  }

  const multiple = Number(draft.maxAttempts) > 1;
  return (
    <div className="flex flex-col gap-4">
      <SelectField
        id="session-attempts"
        label={t('session.field.maxAttempts')}
        hint={lockedHint('maxAttempts')}
        value={draft.maxAttempts}
        disabled={!open('maxAttempts')}
        onChange={(e) => patch({ maxAttempts: e.target.value })}
      >
        {Array.from({ length: SESSION_ATTEMPTS_MAX }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
      {multiple && (
        <SelectField
          id="session-scoring"
          label={t('session.field.attemptScoring')}
          hint={lockedHint('attemptScoring') ?? t('session.field.attemptScoringHint')}
          value={draft.attemptScoring}
          disabled={!open('attemptScoring')}
          onChange={(e) =>
            patch({ attemptScoring: e.target.value as SessionDraft['attemptScoring'] })
          }
        >
          <option value="highest">{t('session.field.highest')}</option>
          <option value="latest">{t('session.field.latest')}</option>
        </SelectField>
      )}
      <Check
        id="session-shuffle-items"
        label={t('session.field.shuffleItems')}
        hint={lockedHint('shuffleItems') ?? t('session.field.shuffleItemsHint')}
        checked={draft.shuffleItems}
        disabled={!open('shuffleItems')}
        onChange={(shuffleItems) => patch({ shuffleItems })}
      />
      <Check
        id="session-shuffle-options"
        label={t('session.field.shuffleOptions')}
        hint={lockedHint('shuffleOptions') ?? t('session.field.shuffleOptionsHint')}
        checked={draft.shuffleOptions}
        disabled={!open('shuffleOptions')}
        onChange={(shuffleOptions) => patch({ shuffleOptions })}
      />
      <Check
        id="session-show-rules"
        label={t('session.field.showScoringRules')}
        hint={lockedHint('showScoringRules') ?? t('session.field.showScoringRulesHint')}
        checked={draft.showScoringRules}
        disabled={!open('showScoringRules')}
        onChange={(showScoringRules) => patch({ showScoringRules })}
      />
      <div className="flex flex-col gap-2">
        <TextField
          id="session-code"
          label={t('session.field.accessCode')}
          hint={lockedHint('accessCode') ?? t('session.field.accessCodeHint')}
          error={error('accessCode', draft.accessCode !== '')}
          value={draft.accessCode}
          maxLength={14}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-widest uppercase"
          disabled={!open('accessCode')}
          onChange={(e) => patch({ accessCode: e.target.value })}
        />
        {onSuggestCode && open('accessCode') && (
          <div>
            <Button onClick={onSuggestCode} disabled={codeBusy}>
              {t('session.field.suggestAnother')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
