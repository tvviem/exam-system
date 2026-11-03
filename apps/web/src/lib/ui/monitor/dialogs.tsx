import { EXTEND_MINUTES_MAX, EXTEND_REASON_MAX } from '@exam/shared';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newId } from '../../uuid';
import { Button, Dialog, TextField } from '..';

// Hộp thoại của các thao tác nặng: luôn nêu số người bị ảnh hưởng, đòi lý do khi cần (Q254, Q256, Q259, Q260).

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="text-sm text-fg-muted">{children}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

const MINUTES = [5, 10, 15, 30];

/**
 * Cộng giờ cho một người, một nhóm hoặc cả phòng. Mã yêu cầu sinh một lần khi mở hộp và giữ đến khi đóng, nên bấm lại
 * sau khi mất mạng không cộng hai lần (Q262).
 */
export function ExtendDialog({
  count,
  scope,
  busy,
  onConfirm,
  onClose,
}: {
  count: number;
  scope: string;
  busy: boolean;
  onConfirm: (input: { minutes: number; reason: string; batchId: string }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [batchId] = useState(() => newId());
  const [preset, setPreset] = useState(5);
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('');
  // Ô "số phút khác" thắng nút chọn sẵn khi đã nhập; nhập sai (ngoài 1–180, không nguyên) thì khóa nút xác nhận.
  const typed = custom.trim() === '' ? null : Number(custom);
  const minutes = typed ?? preset;
  const validMinutes = Number.isInteger(minutes) && minutes >= 1 && minutes <= EXTEND_MINUTES_MAX;
  return (
    <Dialog open onClose={onClose} title={t('monitor.extend.title')}>
      <p className="text-sm text-fg-muted">{t('monitor.extend.note', { scope, count })}</p>
      <fieldset className="m-0 grid grid-cols-4 gap-2 border-0 p-0">
        <legend className="sr-only">{t('monitor.extend.minutes')}</legend>
        {MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={typed === null && preset === m}
            onClick={() => {
              setPreset(m);
              setCustom('');
            }}
            className={`min-h-12 cursor-pointer rounded-lg border text-sm font-semibold pointer-fine:min-h-9 ${
              typed === null && preset === m
                ? 'border-primary bg-primary-soft text-on-primary-soft'
                : 'border-border-strong bg-surface'
            }`}
          >
            {t('monitor.extend.plus', { minutes: m })}
          </button>
        ))}
      </fieldset>
      <TextField
        id="extend-custom"
        label={t('monitor.extend.custom')}
        inputMode="numeric"
        value={custom}
        onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
      />
      <TextField
        id="extend-reason"
        label={t('monitor.reasonRequired')}
        value={reason}
        maxLength={EXTEND_REASON_MAX}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('monitor.extend.reasonHint')}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={busy || count === 0 || reason.trim() === '' || !validMinutes}
          onClick={() => onConfirm({ minutes, reason: reason.trim(), batchId })}
        >
          {t('monitor.extend.confirm', { minutes: validMinutes ? minutes : '…', count })}
        </Button>
      </div>
    </Dialog>
  );
}

/** Hộp thoại có ô lý do: Cảnh cáo và Đình chỉ (bắt buộc, Q259), Thu hồi thiết bị (tùy chọn, Q260). */
export function ReasonDialog({
  title,
  body,
  confirmLabel,
  danger,
  required,
  maxLength,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  required: boolean;
  maxLength: number;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onClose={onClose} title={title}>
      <div className="text-sm text-fg-muted">{body}</div>
      <TextField
        id="monitor-reason"
        label={required ? t('monitor.reasonRequired') : t('monitor.reasonOptional')}
        value={reason}
        maxLength={maxLength}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={busy || (required && reason.trim() === '')}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
