import { createFileRoute } from '@tanstack/react-router';
import { AuthLinkPage } from '../lib/ui/auth-link-page';

// Trang công khai: sinh viên mở Liên kết một lần trong thư kích hoạt (mã ở mảnh `#`).
export const Route = createFileRoute('/activate')({
  component: () => <AuthLinkPage purpose="activation" />,
});
