// Rút câu theo Phần (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.3). Hàm thuần: máy chủ dùng để rút lúc bắt đầu Lượt,
// giao diện dùng để hiện "mỗi người nhận bao nhiêu câu".

/**
 * Số câu rút của một Phần có `total` câu theo Tỷ lệ rút `percent` (0 đến 100, tối đa hai chữ số lẻ như cột `numeric(5,2)`):
 * `percent × total / 100` làm tròn **nửa lên**, tối thiểu 1 câu nếu `percent > 0`, tối đa `total`. Tính bằng số nguyên
 * (phần trăm × 100) nên không bị lệch số thực ở các ca đúng một nửa.
 */
export function drawCountOf(percent: number, total: number): number {
  if (total <= 0) return 0;
  const hundredths = Math.round(Math.min(Math.max(percent, 0), 100) * 100);
  if (hundredths === 0) return 0;
  const rounded = Math.floor((hundredths * total + 5000) / 10000);
  return Math.min(total, Math.max(1, rounded));
}

/** Băm chuỗi 53 bit (cyrb53): đủ phân tán cho hạt giống, không cần mật mã học và chạy được cả ở trình duyệt. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hạt giống rút của một người trong một Phần (Q389 a): băm từ mã Phiên thi, mã người dự thi và mã Phần, **không phải** `seed`
 * của Lượt. Nên cố định cho người đó qua mọi Lượt (không cần bảng lưu riêng) và khác nhau giữa người với người. Số nguyên
 * dưới 2^48, khớp hạt giống 48 bit của `layoutOf`. Ba mã được ghi dạng mảng JSON nên ranh giới giữa chúng luôn được tính.
 */
export function drawSeedOf(sessionId: string, userId: string, sectionId: string): number {
  return hash53(JSON.stringify([sessionId, userId, sectionId])) % 2 ** 48;
}

// ---------------- Cấu hình rút ở Bộ đề và Phiên thi (R2, docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8) ----------------

/**
 * Tỷ lệ hiệu lực của từng Phần (Q438): **ghi đè của Phiên thi** nếu có, nếu không thì **mặc định của Bộ đề**, nếu không thì
 * **100 %**. Một nơi duy nhất quyết điều này: bắt đầu Lượt, điểm tối đa và giao diện đều dùng hàm này. Mã Phần lạ trong cấu
 * hình bị bỏ qua. 0 % là giá trị thật (không bị coi là "chưa đặt").
 */
export function effectiveDrawPercents(
  sections: readonly { id: string }[],
  examDefaults: Readonly<Record<string, number>>,
  sessionOverrides: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    sections.map((section) => [
      section.id,
      sessionOverrides[section.id] ?? examDefaults[section.id] ?? 100,
    ]),
  );
}

export type DrawProblemCode = 'draw_points_uneven' | 'draw_all_zero';

export interface DrawProblem {
  code: DrawProblemCode;
  /** Có ở `draw_points_uneven`: Phần có các câu khác điểm. */
  sectionId?: string;
}

/**
 * Vấn đề của một cấu hình rút (`percent` là tỷ lệ hiệu lực, `points` là điểm từng câu của Phần):
 * - `draw_points_uneven` (Q388): Phần rút dưới 100 % mà các câu khác điểm, nên mọi người sẽ không cùng điểm tối đa;
 * - `draw_all_zero` (Q440): không câu nào được rút ở bất kỳ Phần nào, Người dự thi không có gì để làm.
 * Điểm so bằng số nguyên (phần trăm của một điểm) nên 0,1 + 0,2 không bị coi là khác 0,3.
 */
export function drawProblemsOf(
  sections: readonly { id: string; percent: number; points: readonly number[] }[],
): DrawProblem[] {
  const problems: DrawProblem[] = [];
  let drawn = 0;
  for (const section of sections) {
    drawn += drawCountOf(section.percent, section.points.length);
    const centi = new Set(section.points.map((points) => Math.round(points * 100)));
    if (section.percent < 100 && centi.size > 1) {
      problems.push({ code: 'draw_points_uneven', sectionId: section.id });
    }
  }
  if (drawn === 0) problems.push({ code: 'draw_all_zero' });
  return problems;
}
