import { PAPER_PRESETS, type PaperBlocks, type PaperPreset } from '@exam/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Download, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  type ExportedPaper,
  emptyPaperForm,
  loadPaperPrefs,
  type PaperForm,
  type PaperSource,
  paperAnswersRequestOf,
  paperRequestOf,
  paperVariantsRequestOf,
  requestPaper,
  requestVariantsZip,
  type SingleSource,
  saveBlob,
  savePaperPrefs,
  selectPreset,
} from '../paper-export';
import { Button, Dialog, ErrorMessage, PrimaryButton, SelectField, TextField } from '.';
import { useToast } from './toast';

const BLOCKS: { key: keyof PaperBlocks; label: string }[] = [
  { key: 'nationalHeader', label: 'paper.blockNationalHeader' },
  { key: 'candidateFields', label: 'paper.blockCandidateFields' },
  { key: 'grid', label: 'paper.blockGrid' },
];

/**
 * Hộp thoại "Xuất Bộ đề ra Word" (docs/plan/xuat-bo-de-thiet-ke.md mục 4 và 14). Học phần và Mẫu hiện sẵn; Mã đề, Tiêu đề, Đơn vị
 * và các khối nằm trong "Tùy chỉnh". Xong không có cảnh báo thì đóng; có cảnh báo (công thức hay hình không dựng được) thì giữ mở
 * và liệt kê để người dùng biết chỗ cần sửa trong Word.
 */
export function PaperExportDialog({
  open,
  onClose,
  source,
  title,
  variants = [],
}: {
  open: boolean;
  onClose: () => void;
  source: PaperSource;
  /** Tên Phiên thi hoặc Bộ đề, hiện ở dòng giới thiệu. */
  title: string;
  /** Mã đề của Phiên thi dùng chung nhiều Mã đề: hiện hộp chọn Mã đề cần xuất (nguồn chưa nêu Mã đề). */
  variants?: { number: number; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('variants' in source ? 'paper.zipTitle' : 'paper.title')}
    >
      <PaperExportBody source={source} title={title} variants={variants} onClose={onClose} />
    </Dialog>
  );
}

/** Dựng lại mỗi lần mở hộp thoại (Dialog chỉ dựng nội dung khi mở), nên biểu mẫu luôn bắt đầu từ lần nhập gần nhất. */
function PaperExportBody({
  source: given,
  title,
  variants,
  onClose,
}: {
  source: PaperSource;
  title: string;
  variants: { number: number; label: string }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<PaperForm>(() => ({ ...emptyPaperForm(), ...loadPaperPrefs() }));
  // Phiên thi nhiều Mã đề mà nguồn chưa nêu Mã đề: chọn trong hộp (mặc định Mã đề đầu); máy chủ đòi chọn rõ để không xuất nhầm.
  const [variant, setVariant] = useState(variants[0]?.number);
  // Xuất tất cả Mã đề (zip): không chọn Mã đề, không có Mã đề nhập tay; mỗi Mã đề dùng nhãn của nó.
  const zipSession = 'variants' in given ? given.sessionId : null;
  const single: SingleSource | null = 'variants' in given ? null : given;
  const needsPick =
    single !== null && 'sessionId' in single && single.variant === undefined && variants.length > 1;
  const source: SingleSource =
    single === null
      ? { sessionId: zipSession as string }
      : needsPick
        ? { ...single, variant }
        : single;
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const courseField = useRef<HTMLInputElement>(null);

  // <dialog> gọi showModal() ở hiệu ứng của Dialog (chạy sau hiệu ứng của phần con) và đưa focus vào nút Đóng; đợi một nhịp
  // để đưa focus vào ô Học phần, người dùng gõ ngay được.
  useEffect(() => {
    const frame = requestAnimationFrame(() => courseField.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Tải tệp rồi đóng (không cảnh báo) hoặc giữ hộp thoại và liệt kê cảnh báo. */
  const finish = (doneMessage: string) => (file: ExportedPaper) => {
    saveBlob(file.blob, file.filename);
    savePaperPrefs(form);
    if (file.warnings.length === 0) {
      toast(doneMessage);
      onClose();
    } else {
      setWarnings(file.warnings);
    }
  };

  const exportPaper = useMutation({
    mutationFn: () =>
      zipSession !== null
        ? requestVariantsZip(paperVariantsRequestOf(zipSession, form, false))
        : requestPaper(paperRequestOf(source, form)),
    onSuccess: finish(t(zipSession !== null ? 'paper.zipDone' : 'paper.done')),
  });
  const exportAnswers = useMutation({
    mutationFn: () =>
      zipSession !== null
        ? requestVariantsZip(paperVariantsRequestOf(zipSession, form, true))
        : requestPaper(paperAnswersRequestOf(source, form)),
    onSuccess: finish(t(zipSession !== null ? 'paper.zipAnswersDone' : 'paper.answersDone')),
  });

  if (warnings) {
    return (
      <>
        <h3 className="text-base font-semibold">{t('paper.warnedTitle')}</h3>
        <p className="text-sm text-fg-muted">{t('paper.warnedHint')}</p>
        <ul
          aria-label={t('paper.warnings', { count: warnings.length })}
          className="flex flex-col gap-2"
        >
          {warnings.map((warning) => (
            <li
              key={warning}
              className="rounded-lg border border-warning bg-warning-soft p-3 text-sm"
            >
              {warning}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <PrimaryButton onClick={onClose}>{t('common.close')}</PrimaryButton>
        </div>
      </>
    );
  }

  if (confirming) {
    return (
      <ConfirmAnswers
        busy={exportAnswers.isPending}
        error={exportAnswers.isError ? errorMessage(t, exportAnswers.error) : null}
        onCancel={() => {
          exportAnswers.reset();
          setConfirming(false);
        }}
        onConfirm={() => exportAnswers.mutate()}
      />
    );
  }

  const set = (patch: Partial<PaperForm>) => setForm((current) => ({ ...current, ...patch }));
  const canExport = form.course.trim() !== '';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canExport && !exportPaper.isPending) exportPaper.mutate();
      }}
    >
      <div className="flex flex-col gap-1 text-sm">
        <p>
          {zipSession !== null
            ? t('paper.zipFrom', { title })
            : 'sessionId' in source
              ? t('paper.fromSession', { title })
              : t('paper.fromExam', { title })}
        </p>
        <p className="font-medium">
          {t(zipSession !== null ? 'paper.zipContents' : 'paper.noAnswers')}
        </p>
      </div>

      {needsPick && (
        <SelectField
          id="paper-variant"
          label={t('session.variants.exportPick')}
          value={String(variant)}
          onChange={(event) => setVariant(Number(event.target.value))}
        >
          {variants.map((item) => (
            <option key={item.number} value={item.number}>
              {item.label}
            </option>
          ))}
        </SelectField>
      )}

      <TextField
        id="paper-course"
        label={t('paper.course')}
        hint={t('paper.courseHint')}
        ref={courseField}
        required
        maxLength={150}
        value={form.course}
        onChange={(event) => set({ course: event.target.value })}
      />

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">{t('paper.preset')}</legend>
        {PAPER_PRESETS.map((preset: PaperPreset) => {
          const key = preset === 'school' ? 'presetSchool' : 'presetCompact';
          return (
            <label
              key={preset}
              className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                form.preset === preset
                  ? 'border-primary bg-primary-soft text-on-primary-soft'
                  : 'border-border bg-surface'
              }`}
            >
              <input
                type="radio"
                name="paper-preset"
                className="mt-1 size-5"
                checked={form.preset === preset}
                onChange={() => setForm((current) => selectPreset(current, preset))}
              />
              <span className="flex flex-col">
                <span className="font-medium">{t(`paper.${key}`)}</span>
                <span className="text-sm text-fg-muted">{t(`paper.${key}Hint`)}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <details className="group flex flex-col gap-3">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium hover:bg-primary-soft pointer-fine:min-h-9 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 motion-safe:transition-transform group-open:rotate-90"
          />
          {t('paper.custom')}
        </summary>
        <div className="flex flex-col gap-3 pt-2">
          <TextField
            id="paper-title"
            label={t('paper.examTitle')}
            hint={t('paper.examTitleHint')}
            maxLength={100}
            value={form.title}
            onChange={(event) => set({ title: event.target.value })}
          />
          {zipSession === null && (
            <TextField
              id="paper-exam-code"
              label={t('paper.examCode')}
              hint={t('paper.examCodeHint')}
              maxLength={50}
              value={form.examCode}
              onChange={(event) => set({ examCode: event.target.value })}
            />
          )}
          <TextField
            id="paper-unit"
            label={t('paper.unit')}
            hint={t('paper.unitHint')}
            maxLength={150}
            value={form.unit}
            onChange={(event) => set({ unit: event.target.value })}
          />
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-sm font-medium">{t('paper.blocks')}</legend>
            {BLOCKS.map(({ key, label }) => (
              <label
                key={key}
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9"
              >
                <input
                  type="checkbox"
                  className="size-5"
                  checked={form.blocks[key]}
                  onChange={(event) =>
                    set({ blocks: { ...form.blocks, [key]: event.target.checked } })
                  }
                />
                {t(label)}
              </label>
            ))}
          </fieldset>
        </div>
      </details>

      <section className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <h3 className="text-sm font-medium">
          {t(zipSession !== null ? 'paper.zipAnswersTitle' : 'paper.answersTitle')}
        </h3>
        <p className="text-sm text-fg-muted">
          {t(zipSession !== null ? 'paper.zipAnswersHint' : 'paper.answersHint')}
        </p>
        <Button className="w-fit" disabled={!canExport} onClick={() => setConfirming(true)}>
          <KeyRound aria-hidden className="size-5" />
          {t(zipSession !== null ? 'paper.zipAnswersAction' : 'paper.answersAction')}
        </Button>
      </section>

      {exportPaper.isError && <ErrorMessage>{errorMessage(t, exportPaper.error)}</ErrorMessage>}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton type="submit" loading={exportPaper.isPending} disabled={!canExport}>
          <Download aria-hidden className="size-5" />
          {exportPaper.isPending
            ? t('paper.building')
            : t(zipSession !== null ? 'paper.zipDownload' : 'paper.download')}
        </PrimaryButton>
        <Button onClick={onClose} disabled={exportPaper.isPending}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Bước xác nhận trước khi tải tệp Đáp án; focus vào "Hủy" (hành động an toàn) khi mở. */
function ConfirmAnswers({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => cancel.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('paper.confirmTitle')}</h3>
      <p className="text-sm">{t('paper.confirmBody')}</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton loading={busy} onClick={onConfirm}>
          <Download aria-hidden className="size-5" />
          {busy ? t('paper.building') : t('paper.confirmAction')}
        </PrimaryButton>
        <Button ref={cancel} onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
