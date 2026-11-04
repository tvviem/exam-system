/**
 * UUID cho mã sự kiện và mã lô. `crypto.randomUUID` chỉ có ở ngữ cảnh an toàn (HTTPS hoặc localhost); mở bằng
 * `http://<IP mạng LAN>` thì không có, nên dự phòng bằng `getRandomValues` (có ở mọi ngữ cảnh).
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
