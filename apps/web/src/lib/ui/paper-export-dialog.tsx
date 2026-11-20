import { PAPER_PRESETS, type PaperBlocks, type PaperPreset } from '@exam/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  emptyPaperForm,
  loadPaperPrefs,
  type PaperForm,
  type PaperSource,
  paperRequestOf,
  requestPaper,
  saveBlob,
  savePaperPrefs,
  selectPreset,
} from '../paper-export';
import { Button, Dialog, ErrorMessage, PrimaryButton, TextField } from '.';
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
}: {
  open: boolean;
  onClose: () => void;
  source: PaperSource;
  /** Tên Phiên thi hoặc Bộ đề, hiện ở dòng giới thiệu. */
  title: string;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('paper.title')}>
      <PaperExportBody source={source} title={title} onClose={onClose} />
    </Dialog>
  );
}

/** Dựng lại mỗi lần mở hộp thoại (Dialog chỉ dựng nội dung khi mở), nên biểu mẫu luôn bắt đầu từ lần nhập gần nhất. */
function PaperExportBody({
  source,
  title,
  onClose,
}: {
  source: PaperSource;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<PaperForm>(() => ({ ...emptyPaperForm(), ...loadPaperPrefs() }));
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const courseField = useRef<HTMLInputElement>(null);

  // <dialog> gọi showModal() ở hiệu ứng của Dialog (chạy sau hiệu ứng của phần con) và đưa focus vào nút Đóng; đợi một nhịp
  // để đưa focus vào ô Học phần, người dùng gõ ngay được.
  useEffect(() => {
    const frame = requestAnimationFrame(() => courseField.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const exportPaper = useMutation({
    mutationFn: () => requestPaper(paperRequestOf(source, form)),
    onSuccess: ({ blob, filename, warnings: found }) => {
      saveBlob(blob, filename);
      savePaperPrefs(form);
      if (found.length === 0) {
        toast(t('paper.done'));
        onClose();
      } else {
        setWarnings(found);
      }
    },
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
          {'sessionId' in source
            ? t('paper.fromSession', { title })
            : t('paper.fromExam', { title })}
        </p>
        <p className="font-medium">{t('paper.noAnswers')}</p>
      </div>

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
          <TextField
            id="paper-exam-code"
            label={t('paper.examCode')}
            hint={t('paper.examCodeHint')}
            maxLength={50}
            value={form.examCode}
            onChange={(event) => set({ examCode: event.target.value })}
          />
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

      {exportPaper.isError && <ErrorMessage>{errorMessage(t, exportPaper.error)}</ErrorMessage>}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton type="submit" loading={exportPaper.isPending} disabled={!canExport}>
          <Download aria-hidden className="size-5" />
          {exportPaper.isPending ? t('paper.building') : t('paper.download')}
        </PrimaryButton>
        <Button onClick={onClose} disabled={exportPaper.isPending}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
