import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CircleCheck, Download, Send } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api';
import { extendAppealPeriod } from '../../appeals';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import { type ResultsData, releaseSession, setReviewAfterRelease } from '../../grading';
import type { ResultsAction } from '../../results-actions';
import { Button, buttonClass, Dialog, ErrorMessage, PrimaryButton, SelectField } from '..';
import { useToast } from '../toast';

// Công bố kết quả (docs/plan/slice-5.md, PR 5c; Q298): khối trạng thái ở màn Kết quả, hộp xác nhận chọn hạn Phúc khảo, ô "Cho xem
// lại đề", nút Xuất Excel.

/** Nút chính chiếm trọn hàng và lên đầu trên điện thoại; từ 640 px mọi nút nằm cùng một hàng như cũ. */
export const PRIMARY_ACTION_LAYOUT = 'col-span-2 max-sm:order-first sm:col-span-1';
/** Nút phụ trong ô nửa hàng: chữ nhỏ hơn, không xuống dòng (biểu tượng ẩn trên điện thoại để vừa chữ). */
export const SECONDARY_ACTION_COMPACT = 'whitespace-nowrap max-sm:px-2 max-sm:text-sm';

export function ReleasePanel({
  sessionId,
  data,
  primary,
  leading,
  onOpenAppeals,
}: {
  sessionId: string;
  data: ResultsData;
  /** Việc nên làm tiếp (một nút duy nhất được nhấn mạnh). */
  primary: ResultsAction | null;
  /** Các nút của màn Kết quả đứng cùng lưới với Công bố và Xuất Excel (một nhóm nút, không hai hàng rời). */
  leading?: ReactNode;
  /** Mở tab Phúc khảo của màn Kết quả. */
  onOpenAppeals?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('3');
  const [extending, setExtending] = useState(false);
  const [extendDays, setExtendDays] = useState('');
  const [reviewHelp, setReviewHelp] = useState(false);
  const { release } = data;
  const released = release.releasedAt !== null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['grading', sessionId] });

  const publish = useMutation({
    mutationFn: () => releaseSession(sessionId, Number(days)),
    onSuccess: () => {
      toast(t('grading.release.done'));
      setOpen(false);
      void refresh();
    },
    onError: (error) => {
      // Lỗi chặn Công bố (thiếu điều kiện): làm tươi để nút tự khóa kèm lý do mới nhất.
      if (error instanceof ApiError && error.status === 409) void refresh();
    },
  });
  const review = useMutation({
    mutationFn: (value: boolean) => setReviewAfterRelease(sessionId, value),
    onSuccess: () => void refresh(),
    onError: (error) => toast(errorMessage(t, error), 'error'),
  });

  // Gia hạn (Q314): chỉ tăng, tổng tối đa 14 ngày; số ngày hiện tại suy từ hạn và giờ Công bố.
  const currentDays =
    release.releasedAt && release.appealUntil
      ? Math.round(
          (new Date(release.appealUntil).getTime() - new Date(release.releasedAt).getTime()) /
            86_400_000,
        )
      : 0;
  const canExtend = released && release.finalizedAt === null && currentDays > 0 && currentDays < 14;
  const extend = useMutation({
    mutationFn: () => extendAppealPeriod(sessionId, Number(extendDays)),
    onSuccess: () => {
      toast(t('grading.appealExtend.done'));
      setExtending(false);
      void refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void refresh();
    },
  });

  const people = data.people.filter((p) => p.attemptCount > 0).length;
  return (
    <div className="flex flex-col gap-3">
      {released && (
        <p
          role="status"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success"
        >
          <CircleCheck aria-hidden className="size-4" />
          {release.finalizedAt
            ? t('grading.release.finalized', { time: formatDateTime(release.finalizedAt) })
            : release.appealUntil
              ? t('grading.release.releasedUntil', {
                  time: formatDateTime(release.releasedAt as string),
                  until: formatDateTime(release.appealUntil),
                })
              : t('grading.release.released', {
                  time: formatDateTime(release.releasedAt as string),
                })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {leading}
        {!released && (
          <Button
            variant={primary === 'release' ? 'primary' : 'secondary'}
            className={primary === 'release' ? PRIMARY_ACTION_LAYOUT : SECONDARY_ACTION_COMPACT}
            disabled={!release.ready}
            onClick={() => setOpen(true)}
          >
            <Send
              aria-hidden
              className={`size-4 ${primary === 'release' ? '' : 'max-sm:hidden'}`}
            />
            {t('grading.release.open')}
          </Button>
        )}
        <a
          href={`/api/sessions/${sessionId}/results.xlsx`}
          download
          className={buttonClass('secondary', SECONDARY_ACTION_COMPACT)}
        >
          <Download aria-hidden className="size-4 max-sm:hidden" />
          {t('grading.release.export')}
        </a>
      </div>

      {!released && !release.ready && (
        <ul className="list-disc pl-5 text-sm text-fg-muted">
          {release.blockers.map((reason) => (
            <li key={reason}>
              {t(`grading.release.blocker.${reason}`, { count: data.status.pendingEssays })}
            </li>
          ))}
        </ul>
      )}
      {released && <p className="text-sm text-fg-muted">{t('grading.release.locked')}</p>}
      {released && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={onOpenAppeals}
            className="cursor-pointer text-left text-primary underline"
            data-testid="appeal-counts"
          >
            {t('grading.appealExtend.counts', {
              open: release.appeals.open,
              resolved: release.appeals.resolved,
            })}
          </button>
          {canExtend && (
            <Button
              data-testid="appeal-extend-open"
              onClick={() => {
                setExtendDays(String(currentDays + 1));
                setExtending(true);
              }}
            >
              <CalendarPlus aria-hidden className="size-4" />
              {t('grading.appealExtend.open')}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={release.reviewAfterRelease}
            disabled={released || review.isPending}
            onChange={(e) => review.mutate(e.target.checked)}
          />
          <span className="font-medium">{t('session.field.reviewAfterRelease')}</span>
        </label>
        <button
          type="button"
          className="inline-flex min-h-11 cursor-pointer items-center self-start text-primary underline"
          aria-expanded={reviewHelp}
          aria-controls="review-help"
          onClick={() => setReviewHelp((v) => !v)}
        >
          {t(reviewHelp ? 'grading.release.helpHide' : 'grading.release.helpShow')}
        </button>
        <p id="review-help" hidden={!reviewHelp} className="text-fg-muted">
          {t('session.field.reviewAfterReleaseHint')}
        </p>
      </div>

      <Dialog
        open={extending}
        onClose={() => setExtending(false)}
        title={t('grading.appealExtend.title')}
      >
        <p className="text-sm">{t('grading.appealExtend.hint')}</p>
        <SelectField
          id="extend-days"
          label={t('grading.appealExtend.label')}
          value={extendDays}
          onChange={(e) => setExtendDays(e.target.value)}
        >
          {Array.from({ length: 14 - currentDays }, (_, i) => currentDays + 1 + i).map((n) => (
            <option key={n} value={n}>
              {t('grading.appealExtend.days', { count: n })}
            </option>
          ))}
        </SelectField>
        {extend.isError && <ErrorMessage>{errorMessage(t, extend.error)}</ErrorMessage>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setExtending(false)}>{t('common.cancel')}</Button>
          <PrimaryButton
            loading={extend.isPending}
            onClick={() => extend.mutate()}
            data-testid="appeal-extend-confirm"
          >
            {t('grading.appealExtend.confirm')}
          </PrimaryButton>
        </div>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('grading.release.title')}>
        <p className="text-sm">{t('grading.release.summary', { count: people })}</p>
        {data.status.violationsUndecided > 0 && (
          <p className="text-sm text-warning">
            {t('grading.release.undecided', { count: data.status.violationsUndecided })}
          </p>
        )}
        <SelectField
          id="release-days"
          label={t('grading.release.appealPeriod')}
          hint={t('grading.release.appealHint')}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="0">{t('grading.release.noAppeal')}</option>
          {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {t('grading.release.days', { count: n })}
            </option>
          ))}
        </SelectField>
        <p className="text-sm text-fg-muted">{t('grading.release.irreversible')}</p>
        {publish.isError && <ErrorMessage>{errorMessage(t, publish.error)}</ErrorMessage>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <PrimaryButton loading={publish.isPending} onClick={() => publish.mutate()}>
            {t('grading.release.confirm')}
          </PrimaryButton>
        </div>
      </Dialog>
    </div>
  );
}
