import { KEY_CORRECTION_REASON_MIN } from '@exam/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../errors';
import {
  createKeyCorrection,
  currentKeyOf,
  type Key,
  type KeyImpact,
  type KeyItem,
  keyCorrectionProgressQuery,
  keyItemsQuery,
  keyUsable,
  previewKeyCorrection,
  retryKeyCorrection,
  sameKey,
} from '../../key-corrections';
import { plainTextOf } from '../../take';
import { Button, Dialog, ErrorMessage, PrimaryButton } from '..';
import { ListSkeleton } from '../admin';
import { RichTextView } from '../rich-text-view';

// Đính chính đáp án (docs/plan/slice-5.md, PR 5d-3b; Q316–Q321): chọn câu (nếu chưa chọn), chọn đáp án mới, lý do, xem trước tác
// động, xác nhận, rồi theo dõi chấm lại ở nền. Chỉ chủ Bộ đề dùng (API trả 404 với người khác).

const LETTERS = 'ABCDEFGH';
const REASON_MAX = 1000;

export function KeyCorrectionDialog({
  examId,
  itemId,
  open,
  onClose,
}: {
  examId: string;
  /** Câu cần đính chính; không truyền thì hiện danh sách câu để chọn. */
  itemId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const items = useQuery({ ...keyItemsQuery(examId), enabled: open });
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const currentId = itemId ?? picked;
  const item = items.data?.items.find((entry) => entry.itemId === currentId);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={item ? t('keyFix.title', { no: item.no }) : t('keyFix.pickTitle')}
    >
      {items.isPending && <ListSkeleton rows={3} />}
      {items.isError && <ErrorMessage>{errorMessage(t, items.error)}</ErrorMessage>}
      {items.data && !item && !currentId && (
        <ItemPicker items={items.data.items} onPick={setPicked} />
      )}
      {item && (
        <CorrectionForm
          key={item.itemId}
          examId={examId}
          item={item}
          onClose={() => {
            setPicked(undefined);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

function ItemPicker({ items, onPick }: { items: KeyItem[]; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return <p className="text-fg-muted">{t('keyFix.noItems')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{t('keyFix.pickHint')}</p>
      <ul className="flex flex-col gap-2">
        {items.map((entry) => (
          <li key={entry.itemId}>
            <button
              type="button"
              data-testid="key-pick"
              onClick={() => onPick(entry.itemId)}
              className="flex min-h-14 w-full cursor-pointer flex-col gap-0.5 rounded-xl border border-border bg-surface p-3 text-left hover:bg-primary-soft"
            >
              <span className="font-medium">
                {t('grading.person.item', { no: entry.no })}{' '}
                <span className="text-sm font-normal text-fg-muted">
                  {t(`grading.type.${entry.type}`)}
                  {entry.corrections > 0
                    ? ` · ${t('keyFix.corrected', { count: entry.corrections })}`
                    : ''}
                </span>
              </span>
              <span className="line-clamp-2 text-sm text-fg-muted">{plainTextOf(entry.stem)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CorrectionForm({
  examId,
  item,
  onClose,
}: {
  examId: string;
  item: KeyItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const current = currentKeyOf(item);
  const [key, setKey] = useState<Key>(current);
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState<KeyImpact | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);

  const change = (next: Key) => {
    setKey(next);
    setImpact(null); // đáp án đổi thì phải xem trước lại
  };
  const preview = useMutation({
    mutationFn: () => previewKeyCorrection(examId, item.itemId, key),
    onSuccess: setImpact,
  });
  const create = useMutation({
    mutationFn: () => createKeyCorrection(examId, item.itemId, key, reason.trim()),
    onSuccess: (done) => setCorrectionId(done.id),
  });

  if (correctionId) {
    return <Progress examId={examId} correctionId={correctionId} onClose={onClose} />;
  }
  const changed = !sameKey(key, current);
  const usable = keyUsable(item, key);
  const reasonOk = reason.trim().length >= KEY_CORRECTION_REASON_MIN;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
        <p className="text-sm text-fg-muted">
          {t(`grading.type.${item.type}`)} · {t('questionBank.points', { points: item.points })}
        </p>
        <RichTextView doc={item.stem} />
      </div>

      <KeyChooser item={item} value={key} current={current} onChange={change} />

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="key-reason">
        {t('keyFix.reasonLabel', { min: KEY_CORRECTION_REASON_MIN })}
        <textarea
          id="key-reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-24 w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-base font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
        <span className="self-end text-xs font-normal text-fg-muted tabular-nums">
          {reason.trim().length}/{REASON_MAX}
        </span>
      </label>

      {!changed && <p className="text-sm text-fg-muted">{t('keyFix.same')}</p>}
      {preview.isError && <ErrorMessage>{errorMessage(t, preview.error)}</ErrorMessage>}
      {impact && <ImpactBox impact={impact} />}

      {/* Q321: câu gốc ở Ngân hàng câu hỏi không tự sửa. */}
      <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {t('keyFix.bankNote')}{' '}
          <Link
            to="/examiner/questions/$questionId"
            params={{ questionId: item.questionId }}
            className="font-medium underline"
          >
            {t('keyFix.openBank')}
          </Link>
        </span>
      </p>

      {create.isError && <ErrorMessage>{errorMessage(t, create.error)}</ErrorMessage>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        {impact ? (
          <PrimaryButton
            loading={create.isPending}
            disabled={!changed || !usable || !reasonOk}
            onClick={() => create.mutate()}
            data-testid="key-confirm"
          >
            {t('keyFix.confirm')}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            loading={preview.isPending}
            disabled={!changed || !usable}
            onClick={() => preview.mutate()}
            data-testid="key-preview"
          >
            {t('keyFix.preview')}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

function KeyChooser({
  item,
  value,
  current,
  onChange,
}: {
  item: KeyItem;
  value: Key;
  current: Key;
  onChange: (key: Key) => void;
}) {
  const { t } = useTranslation();
  if (item.type === 'true_false_cluster') {
    const record = (Array.isArray(value) ? {} : value) as Record<string, boolean>;
    const was = (Array.isArray(current) ? {} : current) as Record<string, boolean>;
    return (
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">{t('keyFix.newKeyStatements')}</legend>
        {(item.payload.statements ?? []).map((statement, index) => (
          <div
            key={statement.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 w-6 shrink-0 text-sm font-semibold">
                {String.fromCharCode(97 + index)})
              </span>
              <RichTextView doc={statement.content} className="flex-1" />
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={plainTextOf(statement.content)}
            >
              {([true, false] as const).map((answer) => (
                <label
                  key={String(answer)}
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-4 font-semibold has-checked:border-primary has-checked:bg-primary-soft"
                >
                  <input
                    type="radio"
                    name={`stmt-${statement.id}`}
                    checked={record[statement.id] === answer}
                    onChange={() => onChange({ ...record, [statement.id]: answer })}
                    className="size-5"
                  />
                  {answer ? t('take.true') : t('take.false')}
                  {was[statement.id] === answer && (
                    <span className="text-xs font-normal text-fg-muted">
                      ({t('keyFix.currentKey')})
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    );
  }
  const multiple = item.type === 'multiple_choice';
  const chosen = new Set(Array.isArray(value) ? value : []);
  const was = new Set(Array.isArray(current) ? current : []);
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-sm font-medium">
        {t(multiple ? 'keyFix.newKeyMany' : 'keyFix.newKeyOne')}
      </legend>
      {(item.payload.options ?? []).map((option, index) => (
        <label
          key={option.id}
          className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 has-checked:border-primary has-checked:bg-primary-soft"
        >
          <input
            type={multiple ? 'checkbox' : 'radio'}
            name="new-key"
            checked={chosen.has(option.id)}
            onChange={(e) => {
              if (!multiple) return onChange([option.id]);
              const next = e.target.checked
                ? [...chosen, option.id]
                : [...chosen].filter((id) => id !== option.id);
              onChange(
                (item.payload.options ?? []).map((o) => o.id).filter((id) => next.includes(id)),
              );
            }}
            className="mt-1 size-5"
          />
          <span aria-hidden className="mt-0.5 w-6 shrink-0 text-sm font-semibold">
            {LETTERS[index]}
          </span>
          <RichTextView doc={option.content} className="flex-1" />
          {was.has(option.id) && (
            <span className="shrink-0 text-xs text-fg-muted">({t('keyFix.currentKey')})</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

function ImpactBox({ impact }: { impact: KeyImpact }) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="key-impact"
      className="flex flex-col gap-1 rounded-xl border border-primary bg-primary-soft p-3 text-sm text-on-primary-soft"
    >
      <p className="font-semibold">
        {t('keyFix.impact', {
          increase: impact.increase,
          decrease: impact.decrease,
          unchanged: impact.unchanged,
        })}
      </p>
      {impact.finalizedSessions > 0 && (
        <p>{t('keyFix.impactFinalized', { count: impact.finalizedSessions })}</p>
      )}
      {impact.openAppeals > 0 && <p>{t('keyFix.impactAppeals', { count: impact.openAppeals })}</p>}
      <p>{t('keyFix.impactNote')}</p>
    </section>
  );
}

function Progress({
  examId,
  correctionId,
  onClose,
}: {
  examId: string;
  correctionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const progress = useQuery(keyCorrectionProgressQuery(examId, correctionId));
  const status = progress.data?.status;
  // Xong: làm tươi mọi màn chấm và Kết quả đang mở.
  useEffect(() => {
    if (status === 'done') void queryClient.invalidateQueries({ queryKey: ['grading'] });
  }, [status, queryClient]);
  const retry = useMutation({
    mutationFn: () => retryKeyCorrection(examId, correctionId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['grading', 'exam', examId, 'key-correction', correctionId],
      }),
  });
  const data = progress.data;
  const pct = data && data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-4" data-testid="key-progress" data-status={status}>
      {progress.isError && <ErrorMessage>{errorMessage(t, progress.error)}</ErrorMessage>}
      {status === 'done' ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 font-semibold text-success"
        >
          <CircleCheck aria-hidden className="size-5" />
          {t('keyFix.done', { increase: data?.increase ?? 0, decrease: data?.decrease ?? 0 })}
        </p>
      ) : status === 'failed' ? (
        <ErrorMessage>{t('keyFix.failed')}</ErrorMessage>
      ) : (
        <div className="flex flex-col gap-2" role="status">
          <p className="font-medium">
            {t('keyFix.running', { processed: data?.processed ?? 0, total: data?.total ?? 0 })}
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-3 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full bg-primary motion-safe:transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-fg-muted">{t('keyFix.runningHint')}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        {status === 'failed' && (
          <PrimaryButton loading={retry.isPending} onClick={() => retry.mutate()}>
            {t('keyFix.retry')}
          </PrimaryButton>
        )}
        <Button onClick={onClose} data-testid="key-close">
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
