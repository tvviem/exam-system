import { VARIANT_COUNT_MAX } from '@exam/shared';

// Mã đề ở form Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md; Q463, Q479): Cách ra đề và số Mã đề. Hàm thuần, dùng chung cho
// bản nháp trên màn hình và dữ liệu gửi lên, nên kiểm thử được mà không cần dựng giao diện.

export type DrawScope = 'shared' | 'per_candidate';

/** Mặc định của Phiên thi mới trên giao diện: dùng chung một Mã đề (Q463). */
export const DEFAULT_DRAW_SCOPE: DrawScope = 'shared';

/** Ô "Số Mã đề": số nguyên từ 1 đến 10. Chưa hợp lệ thì tạm tính 1 để phần còn lại của form vẫn hiển thị được. */
export function variantCountOf(text: string): { valid: boolean; count: number } {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { valid: false, count: 1 };
  const count = Number(trimmed);
  return count >= 1 && count <= VARIANT_COUNT_MAX
    ? { valid: true, count }
    : { valid: false, count: 1 };
}

/** Hai trường Mã đề của bản nháp, lấy từ Phiên thi đã lưu. Phiên thi cũ chưa có trường thì là mỗi người một đề. */
export function variantFieldsOfSession(session: {
  drawScope?: DrawScope;
  variants?: readonly { number: number }[];
}): { drawScope: DrawScope; variantCount: string } {
  const drawScope = session.drawScope ?? 'per_candidate';
  return {
    drawScope,
    variantCount: String(Math.max(1, session.variants?.length ?? 1)),
  };
}

/** Phần Mã đề của dữ liệu gửi lên. Ô trống thành NaN để lược đồ dùng chung (`@exam/shared`) báo sai đúng ô. */
export function variantFieldsInput(draft: { drawScope: DrawScope; variantCount: string }): {
  drawScope: DrawScope;
  variantCount?: number;
} {
  if (draft.drawScope === 'per_candidate') return { drawScope: 'per_candidate' };
  return {
    drawScope: 'shared',
    variantCount: draft.variantCount.trim() === '' ? Number.NaN : Number(draft.variantCount),
  };
}

/** Các Mã đề để chọn (hộp chọn Mã đề khi xem thử, xuất Word). */
export function variantNumbersOf(
  variants: readonly { number: number; label: string }[] | undefined,
): { number: number; label: string }[] {
  return (variants ?? []).map(({ number, label }) => ({ number, label }));
}
