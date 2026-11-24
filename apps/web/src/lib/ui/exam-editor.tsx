import { POINTS_MAX, POINTS_MIN, POINTS_STEP, plainTextOf } from '@exam/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Info,
  ListChecks,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api';
import { errorMessage } from '../errors';
import {
  addItems,
  addSection,
  currentSectionIndex,
  type DraftItem,
  type DraftSection,
  type DrawSummary,
  draftFromExam,
  drawPercentValid,
  drawSummaryOf,
  type ExamDraft,
  moveItem,
  moveItemToSection,
  moveSection,
  numberFromText,
  numberOf,
  questionIdsOf,
  removeItem,
  removeSection,
  setDrawPercent,
  setPoints,
  textForNumber,
  toContent,
  totalsOf,
  updateSection,
} from '../exam-draft';
import { filterExamItems, type ItemFilter, tagsOfExam } from '../exam-filter';
import { examOverviewOf } from '../exam-overview';
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
import { ExamItemFilter } from './exam-item-filter';
import { ExamOverviewCard } from './exam-overview';
import { ExamPreview } from './exam-preview';
import { ExamPublishDialog } from './exam-publish-dialog';
import { KeyCorrectionDialog } from './grading/key-correction-dialog';
import { PageHeader } from './page-header';
import { PaperExportDialog } from './paper-export-dialog';
import { Rich } from './question-editor-fields';
import { QuestionPicker } from './question-picker';
import { QuickPointsDialog } from './quick-points-dialog';
import { SectionNav } from './section-nav';
import { StickyActionBar } from './sticky-action-bar';
import { Tabs } from './tabs';
import { useToast } from './toast';

/** Mốc dưới thanh đầu trang để biết Phần nào đang được xem, và để cuộn tới đầu Phần không bị thanh che. */
const SECTION_NAV_OFFSET = 96;

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
    setText((current) => textForNumber(current, points));
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
        onChange(numberFromText(e.target.value));
      }}
      className="h-12 w-24 rounded-lg border border-border-strong bg-surface px-3 text-right text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-10"
    />
  );
}

/** Ô tỷ lệ rút của Phần: giữ chuỗi đang gõ ("12," chưa thành số), chỉ báo lên bản nháp khi đã là số; để trống là NaN. */
function DrawPercentInput({
  id,
  percent,
  label,
  describedBy,
  disabled,
  onChange,
}: {
  id: string;
  percent: number;
  label: string;
  describedBy: string;
  disabled: boolean;
  onChange: (percent: number) => void;
}) {
  const [text, setText] = useState(String(percent));
  useEffect(() => {
    setText((current) => textForNumber(current, percent));
  }, [percent]);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      aria-invalid={!drawPercentValid(percent)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(numberFromText(e.target.value));
      }}
      className="h-12 w-24 rounded-lg border border-border-strong bg-surface px-3 text-right text-base tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger pointer-fine:h-10"
    />
  );
}

/**
 * Rút câu của một Phần (Q438): ô tỷ lệ, số câu mỗi người nhận, và cảnh báo lệch điểm (Q441). Bộ đề không dùng Rút câu (100 %) chỉ
 * thấy một dòng gọn "lấy đủ N câu". Đã Phát hành thì chỉ đọc.
 */
function DrawRow({
  section,
  summary,
  readOnly,
  showAllHint,
  onChange,
}: {
  section: DraftSection;
  summary: DrawSummary;
  readOnly: boolean;
  /** Chú thích "100 % là lấy đủ" chỉ hiện một lần (Phần đầu) khi chưa Phần nào rút, để không lặp chữ ở Bộ đề không dùng Rút câu. */
  showAllHint: boolean;
  onChange: (percent: number) => void;
}) {
  const { t } = useTranslation();
  const mine = summary.sections.find((s) => s.key === section.key);
  if (!mine || (readOnly && section.drawPercent >= 100)) return null;
  const uneven = summary.problems.some(
    (p) => p.code === 'draw_points_uneven' && p.sectionId === section.key,
  );
  const drawing = mine.valid && section.drawPercent < 100;
  const hintId = `draw-hint-${section.key}`;
  const result = drawing
    ? t('exam.draw.result', { count: mine.count, total: mine.total })
    : t('exam.draw.all', { total: mine.total });
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3"
      data-testid="draw-row"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={`draw-${section.key}`} className="text-sm font-semibold">
          {t('exam.draw.label')}
        </label>
        {readOnly ? (
          <span className="text-sm tabular-nums">
            {String(section.drawPercent).replace('.', ',')} %
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <DrawPercentInput
              id={`draw-${section.key}`}
              percent={section.drawPercent}
              label={t('exam.draw.inputLabel')}
              describedBy={hintId}
              disabled={readOnly}
              onChange={onChange}
            />
            <span aria-hidden className="text-sm text-fg-muted">
              %
            </span>
          </span>
        )}
        <span className="text-sm font-medium tabular-nums" aria-live="polite">
          {result}
        </span>
      </div>
      {mine.valid && section.drawPercent === 0 && (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t('exam.draw.zeroNote')}</span>
        </p>
      )}
      <p id={hintId} className="text-xs text-fg-muted">
        {mine.valid
          ? drawing
            ? t('exam.draw.hint')
            : showAllHint
              ? t('exam.draw.hintAll')
              : null
          : null}
        {!mine.valid && (
          <span role="alert" className="text-danger">
            {t('exam.draw.invalid')}
          </span>
        )}
      </p>
      {uneven && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{t('exam.draw.uneven')}</span>
        </p>
      )}
    </div>
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
    <li className="@container rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 p-3 @2xl:flex-row @2xl:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="w-14 shrink-0 text-sm font-semibold text-fg-muted">
            {t('exam.numberN', { n: number })}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="line-clamp-2 wrap-anywhere">{item.question.preview}</span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span className="shrink-0">{t(`questionType.${item.question.type}`)}</span>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate" title={item.question.topicName}>
                {item.question.topicName}
              </span>
              {item.question.archived && <Badge tone="warning">{t('exam.archivedBadge')}</Badge>}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 @2xl:shrink-0 @2xl:justify-end @2xl:border-0 @2xl:pt-0">
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
                  value=""
                  onChange={(e) =>
                    e.target.value && onChange((d) => moveItemToSection(d, id, e.target.value))
                  }
                  title={t('exam.moveHint')}
                  className="h-12 w-44 max-w-full truncate rounded-lg border border-border-strong bg-surface px-2 text-sm pointer-fine:h-10"
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
  const [exporting, setExporting] = useState(false);
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
  const [fixingKey, setFixingKey] = useState(false);
  const skipBlock = useRef(false);
  const readOnly = exam.status !== 'draft';
  const isArchived = exam.status === 'archived';

  const dirty = serialize(draft) !== baseline;
  const totals = totalsOf(draft);
  const draw = drawSummaryOf(draft);
  const allItems = draft.sections.flatMap((s) => s.items);
  const valid =
    draft.title.trim() !== '' &&
    allItems.every((item) => pointsValid(item.points)) &&
    draw.sections.every((s) => s.valid) &&
    !readOnly;
  // Khối Phần chỉ hiện khi đã chia Phần; Phần duy nhất mà đã có tiêu đề hay hướng dẫn thì vẫn hiện để không giấu nội dung.
  const split =
    draft.sections.length > 1 ||
    draft.sections.some((s) => s.title.trim() !== '' || plainTextOf(s.instructions) !== '');
  const sectionName = (section: DraftSection, index: number) =>
    section.title.trim() || t('exam.untitled', { n: index + 1 });
  const sectionList = draft.sections.map((s, i) => ({ key: s.key, name: sectionName(s, i) }));
  // Bộ đề đã phát hành: số liệu tổng quan và bộ lọc câu hỏi (lọc ngay trên máy, không đổi bản nháp).
  const overview = examOverviewOf(
    draft,
    draft.sections.map((s, i) => sectionName(s, i)),
  );
  const examTags = tagsOfExam(draft);
  const [itemFilter, setItemFilter] = useState<ItemFilter>({ query: '', tag: '' });
  const filterResult = filterExamItems(draft, itemFilter);
  // Nút "Lọc" ở thanh dính: cuộn lên ô lọc và gõ được ngay.
  const focusFilter = () => {
    document.getElementById('exam-filter')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.getElementById('exam-filter-query')?.focus({ preventScroll: true });
  };

  // Phần đang xem: theo vị trí cuộn trang (chỉ cần khi Bộ đề có từ hai Phần trở lên).
  const [viewingSection, setViewingSection] = useState(0);
  const sectionKeys = draft.sections.map((s) => s.key).join('|');
  useEffect(() => {
    const keys = sectionKeys.split('|');
    if (keys.length < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const tops = keys.map(
        (key) =>
          document.getElementById(`section-${key}`)?.getBoundingClientRect().top ??
          Number.POSITIVE_INFINITY,
      );
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setViewingSection(currentSectionIndex(tops, SECTION_NAV_OFFSET, atBottom));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sectionKeys]);
  const jumpToSection = (key: string) => {
    const element = document.getElementById(`section-${key}`);
    if (!element) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    element.focus({ preventScroll: true });
    setViewingSection(draft.sections.findIndex((s) => s.key === key));
  };

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
              <Button onClick={() => setExporting(true)}>
                <Download aria-hidden className="size-5" />
                {t('paper.action')}
              </Button>
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
        <PaperExportDialog
          open={exporting}
          onClose={() => setExporting(false)}
          source={{ examId: exam.id }}
          title={draft.title}
        />
      )}
      {readOnly && (
        <ExamOverviewCard overview={overview} viewing={viewingSection} onJump={jumpToSection} />
      )}
      {readOnly && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
          <p role="status">
            {t('exam.readOnlyNote')}{' '}
            {exam.sessionCount > 0
              ? t('exam.sessionCount', { count: exam.sessionCount })
              : t('exam.sessionCountNone')}
            .
          </p>
          <Button className="w-fit" onClick={() => setFixingKey(true)} data-testid="key-fix-open">
            {t('keyFix.open')}
          </Button>
          <KeyCorrectionDialog
            examId={exam.id}
            open={fixingKey}
            onClose={() => setFixingKey(false)}
          />
        </div>
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
                {readOnly ? (
                  // Bộ đề đã phát hành: tên đã có ở tiêu đề trang, thẻ tổng quan ở ngay dưới tiêu đề; đầu tab Soạn là bộ lọc câu hỏi.
                  <ExamItemFilter
                    filter={itemFilter}
                    onChange={setItemFilter}
                    tags={examTags}
                    result={filterResult}
                  />
                ) : (
                  <Card className="flex flex-col gap-4">
                    <TextField
                      id="exam-title"
                      label={t('exam.name')}
                      value={draft.title}
                      maxLength={200}
                      onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
                    />
                    <InstructionsField
                      id="exam-instructions"
                      label={t('exam.instructions')}
                      value={draft.instructions}
                      onChange={(instructions) => change((d) => ({ ...d, instructions }))}
                    />
                  </Card>
                )}

                {draw.active && !readOnly && (
                  <div className="flex flex-col gap-2" data-testid="draw-summary">
                    <p
                      className="rounded-lg border border-border bg-surface-raised p-3 text-sm"
                      aria-live="polite"
                    >
                      {draw.maxPoints === null
                        ? t('exam.draw.summaryCount', { count: draw.count })
                        : t('exam.draw.summary', {
                            count: draw.count,
                            points: String(draw.maxPoints).replace('.', ','),
                          })}
                    </p>
                    {draw.problems.some((p) => p.code === 'draw_all_zero') && (
                      <p
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm"
                      >
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        <span>{t('exam.draw.allZero')}</span>
                      </p>
                    )}
                  </div>
                )}

                {draft.sections.map((section, index) => (
                  <Card
                    key={section.key}
                    id={`section-${section.key}`}
                    tabIndex={-1}
                    className="flex scroll-mt-24 flex-col gap-3 outline-none"
                  >
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

                    {section.items.length > 0 && (
                      <DrawRow
                        section={section}
                        summary={draw}
                        readOnly={readOnly}
                        showAllHint={!draw.active && index === 0}
                        onChange={(percent) =>
                          change((d) => setDrawPercent(d, section.key, percent))
                        }
                      />
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

                    {collapsed.has(section.key) ? null : readOnly &&
                      filterResult.active &&
                      section.items.length > 0 &&
                      (filterResult.perSection.get(section.key) ?? 0) === 0 ? (
                      <p className="text-fg-muted" data-testid="filter-empty">
                        {t('exam.filter.none')}
                      </p>
                    ) : section.items.length === 0 ? (
                      <p className="text-fg-muted">{t('exam.emptySection')}</p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {section.items
                          .filter(
                            (item) =>
                              !(readOnly && filterResult.active) ||
                              filterResult.visible.has(item.questionId),
                          )
                          .map((item) => (
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

                {readOnly && (
                  <StickyActionBar align="end">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {draft.sections.length > 1 && (
                        <SectionNav
                          sections={draft.sections.map((s, i) => ({
                            key: s.key,
                            name: sectionName(s, i),
                            count: s.items.length,
                          }))}
                          current={viewingSection}
                          onJump={jumpToSection}
                        />
                      )}
                      <span
                        className="min-w-0 text-sm text-fg-muted"
                        aria-live="polite"
                        data-testid="view-count"
                      >
                        {filterResult.active
                          ? t('exam.filter.showing', {
                              shown: filterResult.shown,
                              total: filterResult.total,
                            })
                          : t('exam.totals', { items: totals.items, points: totals.points })}
                      </span>
                      <Button onClick={focusFilter}>
                        <Search aria-hidden className="size-5" />
                        {t('exam.filter.open')}
                      </Button>
                    </div>
                  </StickyActionBar>
                )}

                {!readOnly && (
                  <StickyActionBar align="end">
                    <ErrorMessage>
                      {save.isError &&
                        (conflict ? t('exam.conflict') : errorMessage(t, save.error))}
                    </ErrorMessage>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {draft.sections.length > 1 && (
                        <SectionNav
                          sections={draft.sections.map((s, i) => ({
                            key: s.key,
                            name: sectionName(s, i),
                            count: s.items.length,
                          }))}
                          current={viewingSection}
                          onJump={jumpToSection}
                        />
                      )}
                      <div className="flex min-w-0 flex-col gap-0.5 text-sm" aria-live="polite">
                        <span className="text-fg-muted">
                          {t('exam.totals', { items: totals.items, points: totals.points })}
                        </span>
                        {draw.active && (
                          <span data-testid="draw-bar" className="font-medium text-fg">
                            {draw.maxPoints === null
                              ? t('exam.draw.barCount', { count: draw.count })
                              : t('exam.draw.bar', {
                                  count: draw.count,
                                  points: String(draw.maxPoints).replace('.', ','),
                                })}
                          </span>
                        )}
                      </div>
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
                        loading={save.isPending}
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
        sections={draft.sections.map((s, i) => ({
          key: s.key,
          name: sectionName(s, i),
          count: s.items.length,
        }))}
        sectionKey={pickerFor}
        onSectionChange={setPickerFor}
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
