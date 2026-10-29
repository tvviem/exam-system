/** Bỏ dấu (đ → d), chữ thường, chữ cái tổ hợp được gộp. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

/** Dạng so sánh họ tên (Q90): không phân biệt dấu, hoa thường, khoảng trắng thừa. */
export function normalizePersonName(name: string): string {
  return stripAccents(name).replace(/\s+/g, ' ').trim();
}
