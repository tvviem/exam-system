import {
  type DrawProblem,
  drawPercentSchema,
  drawProblemsOf,
  drawTotalsOf,
  effectiveDrawPercents,
} from '@exam/shared';

// Rút câu ở form Phiên thi (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8, Q438): Phiên thi kế thừa tỷ lệ mặc định của từng Phần ở
// Bộ đề và có thể ghi đè. Cùng hàm thuần với server (effectiveDrawPercents, drawTotalsOf, drawProblemsOf).

/** Một Phần của Bộ đề như form Phiên thi cần: mặc định và điểm từng câu. */
export interface DrawSection {
  id: string;
  title: string | null;
  /** Tỷ lệ rút mặc định ở Bộ đề (100 nếu không đặt). */
  defaultPercent: number;
  points: number[];
}

export interface DrawRow {
  id: string;
  title: string | null;
  total: number;
  defaultPercent: number;
  /** Tỷ lệ hiệu lực (ghi đè, nếu không thì mặc định); số gõ dở không hợp lệ tạm tính như mặc định. */
  percent: number;
  /** Số câu mỗi Người dự thi nhận ở Phần này. */
  count: number;
  /** Ô ghi đè hợp lệ và khác mặc định. */
  changed: boolean;
  /** Ô ghi đè đang để trống hoặc sai (cần sửa trước khi Lưu). */
  valid: boolean;
  /** Phần rút dưới 100 % mà các câu khác điểm (Q441). */
  uneven: boolean;
}

export interface DrawPlan {
  rows: DrawRow[];
  /** Số câu mỗi Người dự thi nhận. */
  count: number;
  /** Điểm tối đa; `null` khi còn Phần lệch điểm (không xác định). */
  maxPoints: number | null;
  problems: DrawProblem[];
  /** Có ghi đè nào khác mặc định không. */
  hasOverrides: boolean;
  /** Mọi ô ghi đè đều hợp lệ. */
  valid: boolean;
}

/** Chuỗi người dùng gõ thành số: nhận dấu phẩy; để trống hoặc không phải số là NaN. */
export const parseOverride = (text: string): number => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
};

/**
 * Kế hoạch rút câu của Phiên thi từ các Phần của Bộ đề và các ô ghi đè (`overrides`: mã Phần → chuỗi đang gõ; vắng là kế thừa).
 */
export function sessionDrawPlanOf(
  sections: readonly DrawSection[],
  overrides: Readonly<Record<string, string>>,
  /**
   * Cách ra đề của Phiên thi. Dùng chung Mã đề (Q469): câu lệch điểm trong Phần rút dưới 100 % không còn là lỗi (máy chủ kiểm tổng
   * điểm giữa các Mã đề khi lưu); mỗi người một đề thì giữ luật cùng điểm.
   */
  scope: 'shared' | 'per_candidate' = 'per_candidate',
): DrawPlan {
  const parsed = new Map<string, { number: number; valid: boolean }>();
  for (const section of sections) {
    const text = overrides[section.id];
    if (text === undefined) continue;
    const number = parseOverride(text);
    parsed.set(section.id, { number, valid: drawPercentSchema.safeParse(number).success });
  }
  const defaults = Object.fromEntries(sections.map((s) => [s.id, s.defaultPercent]));
  const usable = Object.fromEntries(
    [...parsed].filter(([, p]) => p.valid).map(([id, p]) => [id, p.number]),
  );
  const percents = effectiveDrawPercents(sections, defaults, usable);
  const found = drawProblemsOf(
    sections.map((s) => ({ id: s.id, percent: percents[s.id] as number, points: s.points })),
  );
  const unevenPoints = found.some((p) => p.code === 'draw_points_uneven'); // điểm tối đa không xác định khi còn Phần lệch điểm
  const problems =
    scope === 'shared' ? found.filter((p) => p.code !== 'draw_points_uneven') : found;
  const totals = drawTotalsOf(
    sections.map((s) => ({ id: s.id, points: s.points })),
    percents,
  );
  const rows = sections.map((section): DrawRow => {
    const mine = parsed.get(section.id);
    const percent = percents[section.id] as number;
    return {
      id: section.id,
      title: section.title,
      total: section.points.length,
      defaultPercent: section.defaultPercent,
      percent,
      count: drawTotalsOf([{ id: section.id, points: section.points }], { [section.id]: percent })
        .count,
      changed: mine?.valid === true && mine.number !== section.defaultPercent,
      valid: mine === undefined || mine.valid,
      uneven: problems.some((p) => p.code === 'draw_points_uneven' && p.sectionId === section.id),
    };
  });
  return {
    rows,
    count: totals.count,
    maxPoints: unevenPoints ? null : totals.maxCenti / 100,
    problems,
    hasOverrides: rows.some((r) => r.changed),
    valid: rows.every((r) => r.valid),
  };
}

/** `sectionDraws` gửi lên: chỉ các Phần có ô ghi đè. Luôn là mảng (mảng rỗng xóa hết ghi đè khi sửa Phiên thi). */
export const overridesInputOf = (
  overrides: Readonly<Record<string, string>>,
): { sectionId: string; percent: number }[] =>
  Object.entries(overrides).map(([sectionId, text]) => ({
    sectionId,
    percent: parseOverride(text),
  }));
