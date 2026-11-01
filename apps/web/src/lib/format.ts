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

export const formatDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '';

/** Ngày dạng `YYYY-MM-DD` (không có múi giờ) hiển thị theo kiểu Việt Nam. */
export const formatDate = (value: string | null) =>
  value ? date.format(new Date(`${value}T00:00:00`)) : '';
