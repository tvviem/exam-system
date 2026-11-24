import { drawProblemsOf, drawTotalsOf } from '@exam/shared';
import { type ExamDraft, totalsOf } from './exam-draft';

// Thẻ tổng quan đầu trang Bộ đề đã phát hành: số liệu chung và của từng Phần, cùng phép tính rút câu với máy chủ (drawTotalsOf).

export interface OverviewSection {
  key: string;
  name: string;
  /** Số câu có sẵn trong Phần. */
  total: number;
  /** Tỷ lệ rút của Phần (100 là lấy đủ). */
  percent: number;
  /** Số câu mỗi Người dự thi nhận từ Phần này. */
  count: number;
  /** Điểm tối đa của phần nhận; `null` khi Phần rút dưới 100 % mà các câu khác điểm (không xác định). */
  points: number | null;
}

export interface ExamOverview {
  totalItems: number;
  totalPoints: number;
  sectionCount: number;
  /** Có Phần nào rút dưới 100 % không. */
  drawing: boolean;
  /** Mỗi Người dự thi nhận bao nhiêu câu và điểm tối đa (`maxPoints` null khi còn Phần lệch điểm). */
  perPerson: { count: number; maxPoints: number | null };
  /** Tỷ lệ rút chung (số câu nhận / số câu cả Bộ đề), một chữ số lẻ; 100 khi không rút. */
  overallPercent: number;
  sections: OverviewSection[];
}

const validPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

/** Số liệu tổng quan của Bộ đề; `names` là tên hiển thị của từng Phần theo thứ tự (nơi gọi đã tính "Phần 1" cho Phần chưa đặt tên). */
export function examOverviewOf(draft: ExamDraft, names: readonly string[]): ExamOverview {
  const totals = totalsOf(draft);
  const sections = draft.sections.map((section, index) => {
    const percent = validPercent(section.drawPercent) ? section.drawPercent : 100;
    const points = section.items.map((entry) => entry.points);
    const drawn = drawTotalsOf([{ id: section.key, points }], { [section.key]: percent });
    const uneven = drawProblemsOf([{ id: section.key, percent, points }]).some(
      (problem) => problem.code === 'draw_points_uneven',
    );
    return {
      key: section.key,
      name: names[index] ?? section.title,
      total: points.length,
      percent,
      count: drawn.count,
      points: uneven ? null : drawn.maxCenti / 100,
    } satisfies OverviewSection;
  });
  const count = sections.reduce((n, section) => n + section.count, 0);
  const drawing = sections.some((section) => section.percent < 100);
  const maxPoints = sections.some((section) => section.points === null)
    ? null
    : Math.round(sections.reduce((sum, section) => sum + (section.points ?? 0) * 100, 0)) / 100;
  return {
    totalItems: totals.items,
    totalPoints: totals.points,
    sectionCount: sections.length,
    drawing,
    perPerson: { count, maxPoints },
    overallPercent:
      drawing && totals.items > 0 ? Math.round((count / totals.items) * 1000) / 10 : 100,
    sections,
  };
}
