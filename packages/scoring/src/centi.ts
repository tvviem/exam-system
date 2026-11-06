// Số học theo đơn vị 0,01 (Q287): điểm tính bằng số nguyên "centi" rồi mới đổi ra số thập phân, nên 0,1 + 0,2 không lệch.

/** Điểm thập phân → số nguyên đơn vị 0,01 (điểm câu đặt theo bước 0,05 nên đổi chính xác). */
export const toCenti = (points: number): number => Math.round(points * 100 + 1e-9);

export const fromCenti = (centi: number): number => centi / 100;

/** `value × num / den` làm tròn half-up về số nguyên, bằng số học nguyên (không qua số thực). `num ≥ 0`, `den > 0`. */
export function mulDivRound(value: number, num: number, den: number): number {
  return Math.floor((2 * value * num + den) / (2 * den));
}
