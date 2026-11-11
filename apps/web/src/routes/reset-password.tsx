import { createFileRoute } from '@tanstack/react-router';
import { AuthLinkPage } from '../lib/ui/auth-link-page';

// Trang công khai: mở Liên kết một lần trong thư đặt lại mật khẩu (mã ở mảnh `#`).
export const Route = createFileRoute('/reset-password')({
  component: () => <AuthLinkPage purpose="password_reset" />,
});
