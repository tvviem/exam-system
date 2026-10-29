const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });

export const formatDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '';

/** Ngày dạng `YYYY-MM-DD` (không có múi giờ) hiển thị theo kiểu Việt Nam. */
export const formatDate = (value: string | null) =>
  value ? date.format(new Date(`${value}T00:00:00`)) : '';
