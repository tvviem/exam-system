// Mã đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.3). Hàm thuần: máy chủ dùng để rút bộ câu của từng Mã đề
// và chia người vào Mã đề; giao diện về sau dùng để hiện kết quả mà không cần gọi máy chủ.

import { drawn, type LayoutInput } from './attempt.js';
import { drawCountOf, hash53 } from './draw.js';

/**
 * Hạt giống rút của một Phần trong một Mã đề: băm từ hạt giống rút của Mã đề và mã Phần (không có người dự thi, vì cả Mã đề
 * dùng chung một bộ câu). Số nguyên dưới 2^48, khớp hạt giống 48 bit của `layoutOf`.
 */
export function variantSeedOf(drawSeed: number, sectionId: string): number {
  return hash53(JSON.stringify(['variant', drawSeed, sectionId])) % 2 ** 48;
}

export interface VariantSection {
  sectionId: string;
  /** Mã các câu của Phần theo thứ tự gốc của Bộ đề. */
  itemIds: readonly string[];
}

/**
 * Bộ câu của một Mã đề: mỗi Phần lấy `drawCountOf` câu (làm tròn nửa lên, tối thiểu 1 câu nếu tỷ lệ lớn hơn 0), trả theo
 * **thứ tự gốc**. Phần không có trong `percents` lấy đủ (100 %). Cùng `drawSeed` thì cùng bộ câu; **tăng tỷ lệ chỉ thêm câu,
 * không đổi những câu đã có** (luồng ngẫu nhiên của một Phần chọn lần lượt từng câu, số câu chỉ quyết dừng ở đâu).
 */
export function drawVariantItems(
  sections: readonly VariantSection[],
  percents: Record<string, number>,
  drawSeed: number,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const section of sections) {
    const total = section.itemIds.length;
    const count = drawCountOf(percents[section.sectionId] ?? 100, total);
    result[section.sectionId] =
      count === total
        ? [...section.itemIds]
        : drawn(section.itemIds, count, variantSeedOf(drawSeed, section.sectionId));
  }
  return result;
}

/**
 * Chia người vào `count` Mã đề: xáo danh sách bằng `random` rồi xoay vòng, nên số người các Mã đề lệch nhau không quá 1.
 * Trả vị trí Mã đề (từ 0) của từng người.
 */
export function assignBalanced(
  userIds: readonly string[],
  count: number,
  random: () => number,
): Map<string, number> {
  const order = [...userIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as string, order[i] as string];
  }
  return new Map(order.map((userId, index) => [userId, index % Math.max(1, count)]));
}

/** Mã đề (vị trí từ 0) có ít người nhất cho người vào sau; hòa thì lấy số nhỏ hơn. `counts` rỗng là Mã đề đầu. */
export function leastLoadedVariant(counts: readonly number[]): number {
  let best = 0;
  counts.forEach((value, index) => {
    if (value < (counts[best] as number)) best = index;
  });
  return best;
}

/**
 * Đầu vào bố cục của một Lượt thuộc Mã đề: chỉ giữ các câu của Mã đề (theo thứ tự gốc); Phần không nêu thì rỗng. Đưa kết quả
 * cho `layoutOf` **không kèm `draw`**: bố cục chỉ xáo thứ tự câu và Phương án bằng hạt giống của Lượt, không rút thêm.
 */
export function layoutInputForVariant(
  input: LayoutInput,
  itemIdsBySection: Record<string, readonly string[]>,
): LayoutInput {
  return {
    sections: input.sections.map((section) => {
      const keep = new Set(itemIdsBySection[section.sectionId] ?? []);
      return {
        sectionId: section.sectionId,
        items: section.items.filter((i) => keep.has(i.itemId)),
      };
    }),
  };
}

/** Gom mã câu của một Mã đề theo từng Phần của bố cục (Mã đề chỉ lưu mã câu): đầu vào của `layoutInputForVariant`. */
export function itemIdsBySectionOf(
  input: LayoutInput,
  itemIds: ReadonlySet<string>,
): Record<string, string[]> {
  return Object.fromEntries(
    input.sections.map((section) => [
      section.sectionId,
      section.items.map((item) => item.itemId).filter((id) => itemIds.has(id)),
    ]),
  );
}
