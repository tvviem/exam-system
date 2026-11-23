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

/** Số người của một Mã đề trong Danh sách dự thi (từ máy chủ). */
export interface VariantLoad {
  number: number;
  label: string;
  count: number;
}

/**
 * Tóm tắt số người từng Mã đề và có lệch không (Q479): lệch khi Mã đề nhiều người nhất hơn Mã đề ít người nhất quá 1 người, thường
 * sau khi Người ra đề đổi tay. Một Mã đề hay không có Mã đề thì không có gì để cân bằng.
 */
export function variantLoadSummary(loads: readonly VariantLoad[] | undefined): {
  parts: VariantLoad[];
  total: number;
  uneven: boolean;
} {
  const parts = (loads ?? []).map(({ number, label, count }) => ({ number, label, count }));
  const counts = parts.map((part) => part.count);
  return {
    parts,
    total: counts.reduce((sum, n) => sum + n, 0),
    uneven: parts.length >= 2 && Math.max(...counts) - Math.min(...counts) > 1,
  };
}

/** Người đã có Lượt làm bài thì Mã đề đã chụp vào Lượt, không đổi được; người chưa làm vẫn đổi được. */
export const canChangeVariant = (row: { attemptCount: number }): boolean => row.attemptCount === 0;

/** Mã đề của chính Người dự thi (Q471): nhãn nếu có, ngược lại ẩn (một Mã đề hay mỗi người một đề thì máy chủ không gửi). */
export const candidateVariantLabel = (
  variant: { number?: number; label: string } | null | undefined,
): string | null => variant?.label ?? null;

/** Số câu của bài (cộng mọi Phần): "bài gồm N câu" ở đầu màn làm bài. */
export const attemptItemCount = (sections: readonly { items: readonly unknown[] }[]): number =>
  sections.reduce((sum, section) => sum + section.items.length, 0);

/** Các Mã đề có trong Theo dõi để chọn lọc: không trùng, theo số thứ tự; người không có Mã đề bị bỏ. */
export function monitorVariantOptions<
  T extends { variant: { number: number; label: string } | null },
>(people: readonly T[]): { number: number; label: string }[] {
  const byNumber = new Map<number, string>();
  for (const person of people) {
    if (person.variant) byNumber.set(person.variant.number, person.variant.label);
  }
  return [...byNumber]
    .map(([number, label]) => ({ number, label }))
    .sort((a, b) => a.number - b.number);
}

/** Bộ lọc Mã đề ở Theo dõi: `selected` rỗng là tất cả; ngược lại chỉ người có đúng số Mã đề đó. */
export const matchesVariant = (
  person: { variant: { number: number } | null },
  selected: string,
): boolean => selected === '' || person.variant?.number === Number(selected);
