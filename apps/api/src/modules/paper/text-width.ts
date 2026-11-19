import { BOLD, REGULAR } from './font-metrics';

/** Bề rộng ký tự lạ (không có trong bảng): bằng chữ "n", đủ gần để chọn cách xếp. */
const FALLBACK_EM = 500;

const widthOfChar = (table: Record<string, number>, char: string): number => {
  const direct = table[char];
  if (direct !== undefined) return direct;
  // chữ có dấu không có trong bảng: bề rộng của chữ cái gốc
  const base = char.normalize('NFD')[0];
  return (base !== undefined ? table[base] : undefined) ?? FALLBACK_EM;
};

/** Độ rộng (mm) của một chuỗi in bằng Times New Roman cỡ `pointSize`. */
export function textWidthMm(
  text: string,
  pointSize: number,
  style: { bold?: boolean } = {},
): number {
  const table = style.bold ? BOLD : REGULAR;
  let em = 0;
  for (const char of text) em += widthOfChar(table, char);
  return (em / 1000) * pointSize * (25.4 / 72);
}
