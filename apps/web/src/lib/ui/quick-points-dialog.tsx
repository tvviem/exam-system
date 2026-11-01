import { distributePoints, type PointsPlan, QUESTION_TYPES, type QuestionType } from '@exam/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyPoints,
  countInScope,
  type DraftSection,
  type ExamDraft,
  type PointsScope,
} from '../exam-draft';
import { Button, Dialog, PrimaryButton, SelectField, TextField } from '.';

const parse = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.replace(',', '.')));

/** Đặt điểm nhanh (Q168): chọn phạm vi và cách đặt, xem trước rồi mới áp vào bản nháp trên màn hình. */
export function QuickPointsDialog({
  open,
  draft,
  sectionName,
  onClose,
  onApply,
}: {
  open: boolean;
  draft: ExamDraft;
  sectionName: (section: DraftSection, index: number) => string;
  onClose: () => void;
  onApply: (next: ExamDraft) => void;
}) {
  const { t } = useTranslation();
  const [scopeKind, setScopeKind] = useState<'all' | 'section' | 'type'>('all');
  const [sectionKey, setSectionKey] = useState(draft.sections[0]?.key ?? '');
  const [type, setType] = useState<QuestionType>('single_choice');
  const [mode, setMode] = useState<'each' | 'total'>('each');
  const [text, setText] = useState('');

  const scope: PointsScope =
    scopeKind === 'section'
      ? { kind: 'section', key: sectionKey }
      : scopeKind === 'type'
        ? { kind: 'type', type }
        : { kind: 'all' };
  const count = countInScope(draft, scope);
  const value = parse(text);
  const plan: PointsPlan =
    mode === 'each' ? { kind: 'each', points: value } : { kind: 'total', total: value };
  const result = applyPoints(draft, scope, plan);
  const preview = distributePoints(count, plan);
  const typed = text.trim() !== '';
  const total = preview.ok ? Math.round(preview.points.reduce((s, p) => s + p * 100, 0)) / 100 : 0;
  const distinct = preview.ok ? [...new Set(preview.points)] : [];

  return (
    <Dialog open={open} onClose={onClose} title={t('exam.quick.title')}>
      <p className="text-fg-muted">{t('exam.quick.intro')}</p>
      <SelectField
        id="quick-scope"
        label={t('exam.quick.scope')}
        value={scopeKind}
        onChange={(e) => setScopeKind(e.target.value as typeof scopeKind)}
      >
        <option value="all">{t('exam.quick.scopeAll')}</option>
        {draft.sections.length > 1 && (
          <option value="section">{t('exam.quick.scopeSection')}</option>
        )}
        <option value="type">{t('exam.quick.scopeType')}</option>
      </SelectField>
      {scopeKind === 'section' && (
        <SelectField
          id="quick-section"
          label={t('exam.quick.pickSection')}
          value={sectionKey}
          onChange={(e) => setSectionKey(e.target.value)}
        >
          {draft.sections.map((s, i) => (
            <option key={s.key} value={s.key}>
              {sectionName(s, i)}
            </option>
          ))}
        </SelectField>
      )}
      {scopeKind === 'type' && (
        <SelectField
          id="quick-type"
          label={t('exam.quick.pickType')}
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          {QUESTION_TYPES.map((qt) => (
            <option key={qt} value={qt}>
              {t(`questionType.${qt}`)}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField
        id="quick-mode"
        label={t('exam.quick.mode')}
        value={mode}
        onChange={(e) => setMode(e.target.value as typeof mode)}
      >
        <option value="each">{t('exam.quick.modeEach')}</option>
        <option value="total">{t('exam.quick.modeTotal')}</option>
      </SelectField>
      <TextField
        id="quick-value"
        label={mode === 'each' ? t('exam.quick.valueEach') : t('exam.quick.valueTotal')}
        hint={t('exam.quick.valueHint')}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={
          typed && !preview.ok && count > 0 ? t(`exam.quick.error.${preview.reason}`) : undefined
        }
      />
      <p aria-live="polite" className="text-sm text-fg-muted">
        {count === 0
          ? t('exam.quick.noItems')
          : preview.ok
            ? t('exam.quick.preview', {
                count,
                total: String(total).replace('.', ','),
                points: distinct.map((p) => String(p).replace('.', ',')).join(' / '),
              })
            : t('exam.quick.willApply', { count })}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton
          disabled={!result.ok}
          onClick={() => {
            if (result.ok) {
              onApply(result.draft);
              onClose();
            }
          }}
        >
          {t('exam.quick.apply')}
        </PrimaryButton>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
