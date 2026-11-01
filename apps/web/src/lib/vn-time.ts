// Mọi giờ nhập và hiển thị cho Phiên thi theo giờ Việt Nam (GMT+7), không phụ thuộc múi giờ của máy (Q4 của 4a).

const OFFSET_MS = 7 * 60 * 60 * 1000;

/** ISO (UTC) sang giá trị của `<input type="datetime-local">` theo giờ Việt Nam: `YYYY-MM-DDTHH:mm`. */
export function isoToVnInput(iso: string): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** Giá trị `datetime-local` (hiểu là giờ Việt Nam) sang ISO có múi giờ rõ ràng, đúng định dạng api yêu cầu. */
export function vnInputToIso(local: string): string {
  return local ? `${local}:00+07:00` : '';
}
