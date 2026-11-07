import { APPEAL_REASON_MIN, APPEAL_TEXT_MAX } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AppealValue,
  createAppeal,
  type MyAppeal,
  type MyAppeals,
  myAppealsQuery,
  remainingText,
} from '../../appeals';
import { errorMessage } from '../../errors';
import { formatDateTime } from '../../format';
import { Button, Dialog, ErrorMessage, PrimaryButton } from '..';
import { useToast } from '../toast';

// Phúc khảo phía Người dự thi (docs/plan/slice-5.md, PR 5d-2; Q300, Q311, Q312): nút theo câu và theo Mức xử lý, hộp xác nhận nêu
// số lượt còn lại, trạng thái và câu trả lời của Người ra đề, tóm tắt hạn ở đầu màn.

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Phúc khảo còn gửi được: có hạn, chưa quá hạn, chưa Chốt (server vẫn là nơi quyết định, đây chỉ để ẩn nút). */
const canSend = (data: MyAppeals, nowMs: number) =>
  data.finalizedAt === null &&
  data.appealUntil !== null &&
  new Date(data.appealUntil).getTime() > nowMs;

export type AppealSubject =
  | { kind: 'response'; no: number }
  | { kind: 'penalty'; violationId: string };

const isSubject = (appeal: MyAppeal, subject: AppealSubject) =>
  subject.kind === 'response'
    ? appeal.target === 'response' && appeal.no === subject.no
    : appeal.target === 'penalty' && appeal.violationId === subject.violationId;

/** Dòng tóm tắt đầu màn: còn bao lâu và đã dùng bao nhiêu lượt. */
export function AppealSummary({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const appeals = useQuery(myAppealsQuery(sessionId));
  if (!appeals.data) return null;
  const data = appeals.data;
  const left = remainingText(data.appealUntil ?? '', Date.now(), {
    day: t('appeal.unit.day'),
    hour: t('appeal.unit.hour'),
    minute: t('appeal.unit.minute'),
  });
  let text: string;
  if (data.finalizedAt) text = t('appeal.summary.finalized');
  else if (!data.appealUntil) text = t('appeal.summary.none');
  else if (left === null) text = t('appeal.summary.ended');
  else text = t('appeal.summary.open', { left, used: data.used, limit: data.limit });
  return (
    <p
      data-testid="appeal-summary"
      className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-on-primary-soft"
    >
      <Clock aria-hidden className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** Phúc khảo của một câu hoặc một Mức xử lý: nút gửi, hoặc trạng thái nếu đã gửi. */
export function AppealBox({
  sessionId,
  subject,
  label,
}: {
  sessionId: string;
  subject: AppealSubject;
  /** Tên đối tượng cho hộp thoại, ví dụ "Câu 7" hoặc "Mức xử lý". */
  label: string;
}) {
  const { t } = useTranslation();
  const appeals = useQuery(myAppealsQuery(sessionId));
  const [open, setOpen] = useState(false);
  if (!appeals.data) return null;
  const data = appeals.data;
  const mine = data.appeals.find((appeal) => isSubject(appeal, subject));
  if (mine) return <AppealStatus appeal={mine} />;
  if (!canSend(data, Date.now())) return null;
  const left = data.limit - data.used;
  if (left <= 0) {
    return (
      <p className="text-sm text-fg-muted" data-testid="appeal-exhausted">
        {t('appeal.exhausted', { limit: data.limit })}
      </p>
    );
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} className="self-start" data-testid="appeal-open">
        <MessageSquareWarning aria-hidden className="size-4" />
        {t('appeal.open', { label })}
      </Button>
      <AppealDialog
        sessionId={sessionId}
        subject={subject}
        label={label}
        left={left}
        limit={data.limit}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function AppealDialog({
  sessionId,
  subject,
  label,
  left,
  limit,
  open,
  onClose,
}: {
  sessionId: string;
  subject: AppealSubject;
  label: string;
  left: number;
  limit: number;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: () =>
      createAppeal(
        sessionId,
        subject.kind === 'response'
          ? { target: 'response', no: subject.no, reason: reason.trim() }
          : { target: 'penalty', violationId: subject.violationId, reason: reason.trim() },
      ),
    onSuccess: (done) => {
      // Hiện ngay Phúc khảo vừa gửi (không chờ tải lại), rồi làm tươi ở nền.
      queryClient.setQueryData(myAppealsQuery(sessionId).queryKey, (old) =>
        old ? { ...old, used: done.used, appeals: [...old.appeals, done.appeal] } : old,
      );
      toast(t('appeal.sent'));
      setReason('');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['take', 'appeals', sessionId] });
    },
    // Lỗi trạng thái (hết hạn, đã Chốt, hết lượt): làm tươi để nút tự biến mất kèm lý do mới nhất.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['take', 'appeals', sessionId] }),
  });
  const trimmed = reason.trim().length;
  const tooShort = trimmed < APPEAL_REASON_MIN;
  return (
    <Dialog
      open={open}
      onClose={() => !send.isPending && onClose()}
      title={t('appeal.dialogTitle', { label })}
      dismissible={!send.isPending}
    >
      <p className="text-sm" data-testid="appeal-left">
        {t('appeal.confirm', { label, left, limit })}
      </p>
      <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
        {t('appeal.mayChange')}
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="appeal-reason">
        {t('appeal.reasonLabel', { min: APPEAL_REASON_MIN })}
        <textarea
          id="appeal-reason"
          value={reason}
          maxLength={APPEAL_TEXT_MAX}
          rows={5}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-32 w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
        <span className="self-end text-xs font-normal text-fg-muted tabular-nums">
          {trimmed}/{APPEAL_TEXT_MAX}
        </span>
      </label>
      {send.isError && <ErrorMessage>{errorMessage(t, send.error)}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose} disabled={send.isPending}>
          {t('common.cancel')}
        </Button>
        <PrimaryButton
          loading={send.isPending}
          disabled={tooShort}
          onClick={() => send.mutate()}
          data-testid="appeal-send"
        >
          {t('appeal.send', { label })}
        </PrimaryButton>
      </div>
    </Dialog>
  );
}

/** Mô tả giá trị trước hoặc sau khi xử lý: điểm của câu hoặc Mức xử lý. */
export function appealValueText(
  t: (key: string, options?: Record<string, unknown>) => string,
  value: AppealValue | null,
) {
  if (!value) return '—';
  if (value.type) {
    return value.type === 'percent'
      ? t('grading.penalty.percent', { percent: fmt(value.percent) })
      : t(`grading.penalty.${value.type}`);
  }
  return fmt(value.score);
}

export function AppealStatus({ appeal }: { appeal: MyAppeal }) {
  const { t } = useTranslation();
  const resolved = appeal.status === 'resolved';
  return (
    <section
      data-testid="appeal-status"
      data-status={appeal.status}
      className={`flex flex-col gap-2 rounded-xl border p-3 text-sm ${
        resolved
          ? 'border-success/50 bg-success-soft text-success'
          : 'border-border-strong bg-surface text-fg'
      }`}
    >
      <p className="flex items-center gap-2 font-semibold">
        {resolved ? (
          <CircleCheck aria-hidden className="size-4" />
        ) : (
          <Clock aria-hidden className="size-4" />
        )}
        {resolved ? t('appeal.status.resolved') : t('appeal.status.open')}
        <span className="font-normal text-fg-muted">· {formatDateTime(appeal.createdAt)}</span>
      </p>
      <p className="text-fg">
        <span className="font-medium">{t('appeal.yourReason')}: </span>
        {appeal.reason}
      </p>
      {resolved && (
        <>
          <p className="text-fg">
            <span className="font-medium">{t('appeal.reply')}: </span>
            {appeal.response}
          </p>
          <p className="font-semibold tabular-nums">
            {t('appeal.change', {
              from: appealValueText(t, appeal.previousValue),
              to: appealValueText(t, appeal.newValue),
            })}
          </p>
        </>
      )}
    </section>
  );
}

/** Mọi Phúc khảo của tôi (kể cả về Mức xử lý đã được bỏ khỏi danh sách Mức xử lý), gấp gọn. */
export function MyAppealsList({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const appeals = useQuery(myAppealsQuery(sessionId));
  const list = appeals.data?.appeals ?? [];
  if (list.length === 0) return null;
  return (
    <details className="rounded-xl border border-border bg-surface p-3" data-testid="my-appeals">
      <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">
        {t('appeal.mine', { count: list.length })}
      </summary>
      <ul className="mt-2 flex flex-col gap-3">
        {list.map((appeal) => (
          <li key={appeal.id} className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {appeal.target === 'response'
                ? t('grading.person.item', { no: appeal.no })
                : t('appeal.penaltyLabel')}
            </p>
            <AppealStatus appeal={appeal} />
          </li>
        ))}
      </ul>
    </details>
  );
}
