import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersQuery } from '../admin';
import { errorMessage } from '../errors';
import { ErrorMessage, SearchField } from '.';

/**
 * Chọn người nhận Chủ đề (Q151): chỉ Người ra đề đang hoạt động, khác người cho. Dùng chung cho Chuyển giao và Xóa
 * người dùng. Danh sách lấy từ `GET /api/admin/users?roleTag=examiner&status=active&q=`.
 */
export function RecipientPicker({
  donorId,
  value,
  onChange,
}: {
  donorId: string;
  value: string | null;
  onChange: (userId: string, fullName: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  // Chờ người dùng gõ xong một nhịp rồi mới hỏi api.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const users = useQuery(usersQuery({ roleTag: 'examiner', status: 'active', q: q || undefined }));
  const candidates = (users.data?.items ?? []).filter((u) => u.id !== donorId && !u.isAdmin);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{t('admin.transfer.recipient')}</legend>
      <SearchField
        id="recipient-search"
        label={t('admin.transfer.searchRecipient')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={100}
      />
      <ErrorMessage>{users.isError && errorMessage(t, users.error)}</ErrorMessage>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1">
        {candidates.length === 0 && !users.isPending && (
          <li className="px-3 py-2 text-sm text-fg-muted">{t('admin.transfer.noCandidates')}</li>
        )}
        {candidates.map((user) => (
          <li key={user.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-1 hover:bg-primary-soft pointer-fine:min-h-10">
              <input
                type="radio"
                name="recipient"
                className="size-5 shrink-0"
                checked={value === user.id}
                onChange={() => onChange(user.id, user.fullName)}
              />
              <span className="flex min-w-0 flex-col">
                <span className="break-words font-medium">{user.fullName}</span>
                <span className="break-words text-sm text-fg-muted">
                  {user.username ?? user.email ?? ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
