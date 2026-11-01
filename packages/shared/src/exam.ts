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
  code: 'duplicate_question' | 'too_many_items';
  path: string;
}

/**
 * Các vấn đề về bố cục mà schema từng trường không thấy: một Câu hỏi xuất hiện hai lần trong Bộ đề (Q162) và quá số
 * câu tối đa (Q161). Vị trí báo là lần xuất hiện sau của câu trùng.
 */
export function examLayoutProblems(content: Pick<ExamContent, 'sections'>): ExamLayoutProblem[] {
  const problems: ExamLayoutProblem[] = [];
  const seen = new Set<string>();
  let total = 0;
  content.sections.forEach((section, s) => {
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
