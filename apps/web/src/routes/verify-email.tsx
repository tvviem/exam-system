import { createFileRoute } from '@tanstack/react-router';
import { VerifyEmailPage } from '../lib/ui/verify-email-page';

// Trang công khai: mở liên kết xác nhận email trong thư (mã ở mảnh `#`); người dùng không cần đăng nhập trên máy mở thư.
export const Route = createFileRoute('/verify-email')({
  component: VerifyEmailPage,
});
