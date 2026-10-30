import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../auth';
import { errorMessage } from '../errors';
import { ErrorMessage, PrimaryButton, TextField } from '.';

/** Biểu mẫu đổi mật khẩu dùng ở trang bắt buộc đổi (mật khẩu tạm) và ở "Tài khoản của tôi". */
export function PasswordForm({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      await onChanged();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMismatch(next !== confirm);
    if (next === confirm) mutation.mutate();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TextField
        id="current-password"
        label={t('changePassword.current')}
        type="password"
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <TextField
        id="new-password"
        label={t('changePassword.new')}
        type="password"
        autoComplete="new-password"
        required
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <TextField
        id="confirm-password"
        label={t('changePassword.confirm')}
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <p className="text-sm text-fg-muted">{t('changePassword.hint')}</p>
      <ErrorMessage>
        {mismatch
          ? t('changePassword.mismatch')
          : mutation.isError && errorMessage(t, mutation.error)}
      </ErrorMessage>
      <PrimaryButton type="submit" disabled={mutation.isPending}>
        {t('changePassword.submit')}
      </PrimaryButton>
    </form>
  );
}
