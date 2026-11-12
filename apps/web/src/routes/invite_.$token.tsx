import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PublicShell } from '../lib/ui/auth-link-page';

// Liên kết Lời mời kiểu cũ (mã nằm trong đường dẫn) không còn dùng được: mã nay chỉ nằm ở mảnh # của liên kết trong thư.
export const Route = createFileRoute('/invite_/$token')({
  component: LegacyInviteLink,
});

function LegacyInviteLink() {
  const { t } = useTranslation();
  return (
    <PublicShell>
      <h1 className="mb-2 text-2xl font-semibold">{t('invite.legacy.heading')}</h1>
      <p className="text-sm text-fg-muted">{t('invite.legacy.text')}</p>
    </PublicShell>
  );
}
