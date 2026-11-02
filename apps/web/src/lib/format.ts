// Giờ luôn hiện theo giờ Việt Nam (GMT+7) dù máy đặt múi giờ khác, để Người ra đề và Người dự thi thấy cùng một giờ.
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
// Năm đủ bốn chữ số: "10/01/30" dễ đọc nhầm khi xem giờ mở và giờ đóng của một Phiên thi.
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });

/** Dung lượng file cho người dùng đọc, dấu phẩy thập phân kiểu Việt Nam: 1536 → "1,5 KB". */
export function formatFileSize(bytes: number): string {
  const unit = (value: number, suffix: string) =>
    `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)} ${suffix}`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return unit(bytes / 1024, 'KB');
  return unit(bytes / (1024 * 1024), 'MB');
}

export const formatDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '';

/** Ngày dạng `YYYY-MM-DD` (không có múi giờ) hiển thị theo kiểu Việt Nam. */
export const formatDate = (value: string | null) =>
  value ? date.format(new Date(`${value}T00:00:00`)) : '';
