import { z } from 'zod';
import { POINTS_MAX, POINTS_MIN, POINTS_STEP } from './question.js';
import { imageNodesOf, plainTextOf, richTextSchema } from './rich-text.js';

// Schema nội dung Bộ đề dùng chung cho web và api (docs/plan/slice-3.md, Q160–Q165, Q167).

export const EXAM_TITLE_MAX = 200;
export const EXAM_MAX_SECTIONS = 20;
export const EXAM_MAX_ITEMS = 200;
export const SECTION_TITLE_MAX = 200;
export const INSTRUCTIONS_MAX_CHARS = 5_000;

/** Hướng dẫn của Bộ đề hoặc Phần: nội dung có định dạng nhưng không có ảnh, tối đa 5.000 ký tự chữ (Q165). */
export const instructionsSchema = richTextSchema
  .refine((doc) => imageNodesOf(doc).length === 0, { message: 'Hướng dẫn không có hình' })
  .refine((doc) => plainTextOf(doc).length <= INSTRUCTIONS_MAX_CHARS, {
    message: `Hướng dẫn tối đa ${INSTRUCTIONS_MAX_CHARS} ký tự`,
  });

const title = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(EXAM_TITLE_MAX));

const sectionTitle = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().max(SECTION_TITLE_MAX))
  .nullable();

const itemSchema = z.strictObject({
  questionId: z.uuid(),
  points: z.number().min(POINTS_MIN).max(POINTS_MAX).multipleOf(POINTS_STEP),
});

const sectionSchema = z.strictObject({
  /** Phần đã có thì nêu id để giữ; Phần mới không có id. */
  id: z.uuid().optional(),
  title: sectionTitle,
  instructions: instructionsSchema,
  items: z.array(itemSchema),
});

/** Toàn bộ nội dung một Bộ đề nháp, gửi và lưu một lần (Q163). `version` là khóa lạc quan. */
export const examContentSchema = z.strictObject({
  title,
  instructions: instructionsSchema,
  version: z.number().int().min(1),
  sections: z.array(sectionSchema).min(1).max(EXAM_MAX_SECTIONS),
});

export type ExamContent = z.infer<typeof examContentSchema>;

export interface ExamLayoutProblem {
  code: 'duplicate_question' | 'duplicate_section' | 'too_many_items';
  path: string;
}

/**
 * Các vấn đề về bố cục mà schema từng trường không thấy: một Câu hỏi xuất hiện hai lần trong Bộ đề (Q162), hai Phần
 * cùng một id (Q163) và quá số câu tối đa (Q161). Vị trí báo là lần xuất hiện sau của mục trùng.
 */
export function examLayoutProblems(content: Pick<ExamContent, 'sections'>): ExamLayoutProblem[] {
  const problems: ExamLayoutProblem[] = [];
  const seen = new Set<string>();
  const sectionIds = new Set<string>();
  let total = 0;
  content.sections.forEach((section, s) => {
    if (section.id) {
      if (sectionIds.has(section.id))
        problems.push({ code: 'duplicate_section', path: `sections.${s}.id` });
      sectionIds.add(section.id);
    }
    section.items.forEach((item, i) => {
      total++;
      if (seen.has(item.questionId)) {
        problems.push({ code: 'duplicate_question', path: `sections.${s}.items.${i}.questionId` });
      }
      seen.add(item.questionId);
    });
  });
  if (total > EXAM_MAX_ITEMS) problems.push({ code: 'too_many_items', path: 'sections' });
  return problems;
}

export type PointsPlan = { kind: 'each'; points: number } | { kind: 'total'; total: number };
export type PointsDistribution =
  | { ok: true; points: number[] }
  | { ok: false; reason: 'empty' | 'invalid_points' | 'invalid_total' | 'too_little' };

/** Số đơn vị bước điểm nếu `value` là bội của bước; null nếu không (tính nguyên để tránh sai số số thực). */
const unitsOf = (value: number): number | null => {
  const units = Math.round(value / POINTS_STEP);
  return Number.isFinite(value) && Math.abs(value / POINTS_STEP - units) < 1e-9 ? units : null;
};

/**
 * Đặt điểm nhanh (Q168): điểm cho `count` câu theo thứ tự.
 * `each` — mỗi câu cùng số điểm. `total` — chia đều tổng; phần dư cộng thêm một bước cho các câu đầu.
 */
export function distributePoints(count: number, plan: PointsPlan): PointsDistribution {
  if (count < 1) return { ok: false, reason: 'empty' };
  const minUnits = Math.round(POINTS_MIN / POINTS_STEP);
  const maxUnits = Math.round(POINTS_MAX / POINTS_STEP);
  const toPoints = (units: number) => Math.round(units * POINTS_STEP * 100) / 100;

  if (plan.kind === 'each') {
    const units = unitsOf(plan.points);
    if (units === null || units < minUnits || units > maxUnits) {
      return { ok: false, reason: 'invalid_points' };
    }
    return { ok: true, points: Array.from({ length: count }, () => toPoints(units)) };
  }

  const total = unitsOf(plan.total);
  if (total === null) return { ok: false, reason: 'invalid_total' };
  const base = Math.floor(total / count);
  const extra = total % count;
  if (base < minUnits) return { ok: false, reason: 'too_little' };
  if (base + (extra > 0 ? 1 : 0) > maxUnits) return { ok: false, reason: 'invalid_total' };
  return {
    ok: true,
    points: Array.from({ length: count }, (_, i) => toPoints(base + (i < extra ? 1 : 0))),
  };
}
