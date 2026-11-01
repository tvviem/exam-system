import { POINTS_MAX, POINTS_MIN, POINTS_STEP, plainTextOf } from '@exam/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Copy, ListChecks, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api';
import { errorMessage } from '../errors';
import {
  addItems,
  addSection,
  type DraftItem,
  type DraftSection,
  draftFromExam,
  type ExamDraft,
  moveItem,
  moveItemToSection,
  moveSection,
  numberOf,
  questionIdsOf,
  removeItem,
  removeSection,
  setPoints,
  toContent,
  totalsOf,
  updateSection,
} from '../exam-draft';
import {
  archiveExam,
  deleteExam,
  duplicateExam,
  type ExamDetail,
  examQuery,
  restoreExam,
  saveExam,
} from '../exams';
import { Badge, Button, Card, Dialog, ErrorMessage, PrimaryButton, TextField } from '.';
import { Breadcrumb } from './breadcrumb';
import { ExamPreview } from './exam-preview';
import { ExamPublishDialog } from './exam-publish-dialog';
import { PageHeader } from './page-header';
import { Rich } from './question-editor-fields';
import { QuestionPicker } from './question-picker';
import { QuickPointsDialog } from './quick-points-dialog';
import { StickyActionBar } from './sticky-action-bar';
import { Tabs } from './tabs';
import { useToast } from './toast';

/** Mốc "đã lưu": bỏ id Phần vì server cấp id cho Phần mới sau khi lưu, không phải là người dùng sửa. */
const serialize = (draft: ExamDraft) => {
  const content = toContent(draft, 0);
  return JSON.stringify({
    ...content,
    sections: content.sections.map(({ id: _id, ...section }) => section),
  });
};

const pointsValid = (points: number) =>
  Number.isFinite(points) &&
  points >= POINTS_MIN &&
  points <= POINTS_MAX &&
  Math.abs(points / POINTS_STEP - Math.round(points / POINTS_STEP)) < 1e-9;

/** Ô điểm giữ chuỗi người dùng đang gõ ("0," chưa thành số) và chỉ báo lên bản nháp khi đã là số. */
function PointsInput({
  points,
  label,
  hint,
  disabled,
  onChange,
}: {
  points: number;
  label: string;
  hint: string;
  disabled: boolean;
  onChange: (points: number) => void;
}) {
  const [text, setText] = useState(String(points));
  useEffect(() => {
    setText((current) => (Number(current.replace(',', '.')) === points ? current : String(points)));
  }, [points]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      title={hint}
      disabled={disabled}
      aria-invalid={!pointsValid(points)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const value = Number(e.target.value.replace(',', '.'));
        onChange(e.target.value.trim() === '' ? Number.NaN : value);
      }}
      className="h-12 w-24 rounded-lg border border-border-strong bg-surface px-3 text-right text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-10"
    />
  );
}

function ItemRow({
  item,
  number,
  sections,
  currentKey,
  readOnly,
  onChange,
}: {
  item: DraftItem;
  readOnly: boolean;
  number: number;
  sections: { key: string; name: string }[];
  currentKey: string;
  onChange: (change: (draft: ExamDraft) => ExamDraft) => void;
}) {
  const { t } = useTranslation();
  const id = item.questionId;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="w-14 shrink-0 text-sm font-semibold text-fg-muted">
          {t('exam.numberN', { n: number })}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 break-words">{item.question.preview}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            {t(`questionType.${item.question.type}`)} · {item.question.topicName}
            {item.question.archived && <Badge tone="warning">{t('exam.archivedBadge')}</Badge>}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-fg-muted">
          <span aria-hidden>{t('exam.points')}</span>
          <PointsInput
            points={item.points}
            label={t('exam.pointsOf', { n: number })}
            hint={t('exam.pointsHint')}
            disabled={readOnly}
            onChange={(points) => onChange((d) => setPoints(d, id, points))}
          />
        </div>
        {!readOnly && (
          <>
            <Button
              aria-label={t('exam.moveUp', { n: number })}
              title={t('exam.up')}
              onClick={() => onChange((d) => moveItem(d, id, -1))}
            >
              <ChevronUp aria-hidden className="size-5" />
            </Button>
            <Button
              aria-label={t('exam.moveDown', { n: number })}
              title={t('exam.down')}
              onClick={() => onChange((d) => moveItem(d, id, 1))}
            >
              <ChevronDown aria-hidden className="size-5" />
            </Button>
            {sections.length > 1 && (
              <select
                aria-label={t('exam.moveToSection', { n: number })}
                title={t('exam.moveHint')}
                value=""
                onChange={(e) =>
                  e.target.value && onChange((d) => moveItemToSection(d, id, e.target.value))
                }
                className="h-12 rounded-lg border border-border-strong bg-surface px-2 text-sm pointer-fine:h-10"
              >
                <option value="">{t('exam.moveHere')}</option>
                {sections
                  .filter((s) => s.key !== currentKey)
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
              </select>
            )}
            <Button
              variant="danger-ghost"
              aria-label={t('exam.removeItem', { n: number })}
              title={t('exam.removeItem', { n: number })}
              onClick={() => onChange((d) => removeItem(d, id))}
            >
              <Trash2 aria-hidden className="size-5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Ô soạn hướng dẫn: gập lại khi còn trống để trang gọn; mở ra bằng nút. */
function InstructionsField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: ExamDraft['instructions'];
  onChange: (doc: ExamDraft['instructions']) => void;
}) {
  const [open, setOpen] = useState(plainTextOf(value) !== '');
  if (!open) {
    return (
      <Button className="w-fit" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-5" />
        {label}
      </Button>
    );
  }
  return <Rich id={id} label={label} value={value} onChange={onChange} allowImages={false} />;
}

/** Trình soạn Bộ đề nháp (Q163, Q185): giữ bản nháp trên màn hình, bấm Lưu mới gửi cả tài liệu lên. */
export function ExamEditor({ exam }: { exam: ExamDetail }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ExamDraft>(() => draftFromExam(exam));
  const [baseline, setBaseline] = useState(() => serialize(draftFromExam(exam)));
  const [version, setVersion] = useState(exam.version);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [tab, setTab] = useState('edit');
  const [removingSection, setRemovingSection] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const skipBlock = useRef(false);
  const readOnly = exam.status !== 'draft';
  const isArchived = exam.status === 'archived';

  const dirty = serialize(draft) !== baseline;
  const totals = totalsOf(draft);
  const allItems = draft.sections.flatMap((s) => s.items);
  const valid =
    draft.title.trim() !== '' && allItems.every((item) => pointsValid(item.points)) && !readOnly;
  // Khối Phần chỉ hiện khi đã chia Phần; Phần duy nhất mà đã có tiêu đề hay hướng dẫn thì vẫn hiện để không giấu nội dung.
  const split =
    draft.sections.length > 1 ||
    draft.sections.some((s) => s.title.trim() !== '' || plainTextOf(s.instructions) !== '');
  const sectionName = (section: DraftSection, index: number) =>
    section.title.trim() || t('exam.untitled', { n: index + 1 });
  const sectionList = draft.sections.map((s, i) => ({ key: s.key, name: sectionName(s, i) }));

  useBlocker({
    shouldBlockFn: () => dirty && !skipBlock.current && !window.confirm(t('exam.leaveConfirm')),
    enableBeforeUnload: () => dirty && !skipBlock.current,
  });

  const change = (apply: (d: ExamDraft) => ExamDraft) => setDraft(apply);

  const save = useMutation({
    mutationFn: (sent: ExamDraft) => saveExam(exam.id, toContent(sent, version)),
    onSuccess: async (saved, sent) => {
      // Mốc "đã lưu" là đúng bản đã gửi (xem PR #21); Phần mới nhận id server cấp, theo thứ tự.
      setBaseline(serialize(sent));
      setVersion(saved.version);
      // Gán id theo khóa của Phần lúc gửi (không theo vị trí hiện tại): người dùng có thể đã sắp lại trong lúc lưu.
      const idByKey = new Map(sent.sections.map((s, i) => [s.key, saved.sections[i]?.id]));
      setDraft((current) => ({
        ...current,
        sections: current.sections.map((s) => ({ ...s, id: s.id ?? idByKey.get(s.key) })),
      }));
      queryClient.setQueryData(examQuery(exam.id).queryKey, saved);
      await queryClient.invalidateQueries({ queryKey: ['exams', 'list'] });
      toast(t('exam.saved'));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteExam(exam.id),
    onSuccess: async () => {
      skipBlock.current = true;
      queryClient.removeQueries({ queryKey: examQuery(exam.id).queryKey });
      await queryClient.invalidateQueries({ queryKey: ['exams', 'list'] });
      await navigate({ to: '/examiner/exams' });
    },
  });

  const refreshExams = async () => {
    queryClient.removeQueries({ queryKey: examQuery(exam.id).queryKey });
    await queryClient.invalidateQueries({ queryKey: ['exams'] });
  };
  const duplicate = useMutation({
    mutationFn: () => duplicateExam(exam.id),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast(t('exam.duplicated'));
      await navigate({ to: '/examiner/exams/$examId', params: { examId: copy.id } });
    },
  });
  const toggleArchive = useMutation({
    mutationFn: () => (isArchived ? restoreExam(exam.id) : archiveExam(exam.id)),
    onSuccess: async () => {
      await refreshExams();
      toast(t(isArchived ? 'exam.restoredDone' : 'exam.archivedDone'));
      await navigate({ to: '/examiner/exams' });
    },
  });

  const conflict = save.error instanceof ApiError && save.error.code === 'CONFLICT';
  const picking = draft.sections.findIndex((s) => s.key === pickerFor);

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[{ label: t('exam.title'), to: '/examiner/exams' }, { label: draft.title || '…' }]}
      />
      <PageHeader
        title={draft.title || t('exam.title')}
        actions={
          readOnly ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isArchived ? 'warning' : 'success'}>
                {t(`exam.status.${exam.status}`)}
              </Badge>
              <Button disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
                <Copy aria-hidden className="size-5" />
                {t('exam.duplicate')}
              </Button>
              <Button disabled={toggleArchive.isPending} onClick={() => toggleArchive.mutate()}>
                {t(isArchived ? 'exam.restoreExam' : 'exam.archiveExam')}
              </Button>
            </div>
          ) : (
            <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-5" />
              {t('exam.delete')}
            </Button>
          )
        }
      />
      {readOnly && (
        <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">
          {t('exam.readOnlyNote')}{' '}
          {exam.sessionCount > 0
            ? t('exam.sessionCount', { count: exam.sessionCount })
            : t('exam.sessionCountNone')}
          .
        </p>
      )}
      <ErrorMessage>
        {(duplicate.isError && errorMessage(t, duplicate.error)) ||
          (toggleArchive.isError && errorMessage(t, toggleArchive.error))}
      </ErrorMessage>

      <Tabs
        label={t('exam.tabs')}
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'edit',
            label: t('exam.tabEdit'),
            content: (
              <div className="flex flex-col gap-4">
                <Card className="flex flex-col gap-4">
                  <TextField
                    id="exam-title"
                    label={t('exam.name')}
                    value={draft.title}
                    maxLength={200}
                    disabled={readOnly}
                    onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
                  />
                  {!readOnly && (
                    <InstructionsField
                      id="exam-instructions"
                      label={t('exam.instructions')}
                      value={draft.instructions}
                      onChange={(instructions) => change((d) => ({ ...d, instructions }))}
                    />
                  )}
                </Card>

                {draft.sections.map((section, index) => (
                  <Card key={section.key} className="flex flex-col gap-3">
                    {split && (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="min-w-0 sm:flex-1">
                            <TextField
                              id={`section-title-${section.key}`}
                              label={t('exam.sectionTitle')}
                              value={section.title}
                              maxLength={200}
                              placeholder={t('exam.untitled', { n: index + 1 })}
                              disabled={readOnly}
                              onChange={(e) =>
                                change((d) =>
                                  updateSection(d, section.key, { title: e.target.value }),
                                )
                              }
                            />
                          </div>
                          {!readOnly && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                aria-label={`${t('exam.sectionUp')}: ${sectionName(section, index)}`}
                                onClick={() => change((d) => moveSection(d, section.key, -1))}
                              >
                                <ChevronUp aria-hidden className="size-5" />
                              </Button>
                              <Button
                                aria-label={`${t('exam.sectionDown')}: ${sectionName(section, index)}`}
                                onClick={() => change((d) => moveSection(d, section.key, 1))}
                              >
                                <ChevronDown aria-hidden className="size-5" />
                              </Button>
                              {draft.sections.length > 1 && (
                                <Button
                                  variant="danger-ghost"
                                  onClick={() =>
                                    section.items.length === 0
                                      ? change((d) => removeSection(d, section.key))
                                      : setRemovingSection(section.key)
                                  }
                                >
                                  <Trash2 aria-hidden className="size-5" />
                                  {t('exam.removeSection')}
                                  <span className="sr-only"> {sectionName(section, index)}</span>
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {!readOnly && (
                          <InstructionsField
                            id={`section-instructions-${section.key}`}
                            label={t('exam.sectionInstructions')}
                            value={section.instructions}
                            onChange={(instructions) =>
                              change((d) => updateSection(d, section.key, { instructions }))
                            }
                          />
                        )}
                      </div>
                    )}

                    {split && (
                      <Button
                        className="w-fit"
                        aria-expanded={!collapsed.has(section.key)}
                        aria-label={`${collapsed.has(section.key) ? t('exam.expand') : t('exam.collapse')}: ${sectionName(section, index)}`}
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (!next.delete(section.key)) next.add(section.key);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(section.key) ? (
                          <ChevronDown aria-hidden className="size-5" />
                        ) : (
                          <ChevronUp aria-hidden className="size-5" />
                        )}
                        {collapsed.has(section.key)
                          ? t('exam.collapsedHint', { count: section.items.length })
                          : t('exam.collapse')}
                      </Button>
                    )}

                    {collapsed.has(section.key) ? null : section.items.length === 0 ? (
                      <p className="text-fg-muted">{t('exam.emptySection')}</p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {section.items.map((item) => (
                          <ItemRow
                            key={item.questionId}
                            item={item}
                            number={numberOf(draft, item.questionId) ?? 0}
                            sections={sectionList}
                            currentKey={section.key}
                            readOnly={readOnly}
                            onChange={change}
                          />
                        ))}
                      </ol>
                    )}
                    {!readOnly && !collapsed.has(section.key) && (
                      <Button className="w-fit" onClick={() => setPickerFor(section.key)}>
                        <Plus aria-hidden className="size-5" />
                        {t('exam.addQuestions')}
                      </Button>
                    )}
                  </Card>
                ))}

                {!readOnly && (
                  <Button className="w-fit" onClick={() => change((d) => addSection(d))}>
                    <Plus aria-hidden className="size-5" />
                    {split ? t('exam.addSection') : t('exam.splitSections')}
                  </Button>
                )}

                {!readOnly && (
                  <StickyActionBar align="end">
                    <ErrorMessage>
                      {save.isError &&
                        (conflict ? t('exam.conflict') : errorMessage(t, save.error))}
                    </ErrorMessage>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm text-fg-muted" aria-live="polite">
                        {t('exam.totals', { items: totals.items, points: totals.points })}
                      </span>
                      {allItems.length > 0 && (
                        <Button onClick={() => setQuickOpen(true)}>
                          <ListChecks aria-hidden className="size-5" />
                          {t('exam.quick.open')}
                        </Button>
                      )}
                      {conflict && (
                        <Button onClick={() => window.location.reload()}>{t('exam.reload')}</Button>
                      )}
                      <Button
                        disabled={dirty || allItems.length === 0 || save.isPending}
                        title={dirty ? t('exam.publishNeedsSave') : undefined}
                        onClick={() => setPublishOpen(true)}
                      >
                        <Send aria-hidden className="size-5" />
                        {t('exam.publishAction')}
                      </Button>
                      <PrimaryButton
                        disabled={!dirty || !valid || save.isPending}
                        onClick={() => save.mutate(draft)}
                      >
                        <Save aria-hidden className="size-5" />
                        {save.isPending ? t('exam.saving') : t('exam.save')}
                      </PrimaryButton>
                    </div>
                  </StickyActionBar>
                )}
              </div>
            ),
          },
          {
            id: 'preview',
            label: t('exam.tabPreview'),
            content: <ExamPreview examId={exam.id} active={tab === 'preview'} dirty={dirty} />,
          },
        ]}
      />

      <QuestionPicker
        open={pickerFor !== null}
        sectionName={
          picking >= 0 ? sectionName(draft.sections[picking] as DraftSection, picking) : ''
        }
        existing={questionIdsOf(draft)}
        onClose={() => setPickerFor(null)}
        onAdd={(picked) => {
          if (pickerFor) change((d) => addItems(d, pickerFor, picked).draft);
          setPickerFor(null);
        }}
      />

      {publishOpen && (
        <ExamPublishDialog
          open
          exam={exam}
          draft={draft}
          sectionName={(index) => sectionName(draft.sections[index] as DraftSection, index)}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {quickOpen && (
        <QuickPointsDialog
          open
          draft={draft}
          sectionName={sectionName}
          onClose={() => setQuickOpen(false)}
          onApply={(next) => change(() => next)}
        />
      )}

      <Dialog
        open={removingSection !== null}
        onClose={() => setRemovingSection(null)}
        title={t('exam.removeSectionTitle')}
      >
        <p>{t('exam.removeSectionBody')}</p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="danger"
            onClick={() => {
              if (removingSection) change((d) => removeSection(d, removingSection));
              setRemovingSection(null);
            }}
          >
            {t('exam.removeSection')}
          </Button>
          <Button onClick={() => setRemovingSection(null)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('exam.deleteTitle')}
      >
        <p>{t('exam.deleteBody')}</p>
        <ErrorMessage>{remove.isError && errorMessage(t, remove.error)}</ErrorMessage>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('exam.delete')}
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
        </div>
      </Dialog>
    </div>
  );
}
