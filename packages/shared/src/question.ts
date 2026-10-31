import { z } from 'zod';
import {
  imageNodesOf,
  mathNodesOf,
  normalizeForSearch,
  plainTextOf,
  type RichText,
  richTextSchema,
} from './rich-text.js';

// Schema Câu hỏi dùng chung cho web và api (docs/plan/slice-2.md, Q114, Q115).

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false_cluster',
  'essay',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const STEM_MAX_CHARS = 20_000;
export const ITEM_MAX_CHARS = 2_000;
export const POINTS_MIN = 0.05;
export const POINTS_STEP = 0.05;
export const POINTS_MAX = 100;
export const TAGS_MAX = 10;
export const TAG_MAX_CHARS = 30;
// Giới hạn công thức mỗi Câu hỏi: số lượng, và tổng ký tự để server dựng thử KaTeX không tốn quá nhiều CPU mỗi lần lưu.
export const MATH_MAX_PER_QUESTION = 50;
/** Số Hình minh họa tối đa trong một Câu hỏi, tính trên mọi nội dung (Q137). */
export const IMAGE_MAX_PER_QUESTION = 10;
export const MATH_MAX_TOTAL_CHARS = 10_000;

/** Nội dung có chữ (không rỗng) và không dài quá `max` ký tự văn bản. */
const textOf = (max: number) =>
  richTextSchema.refine(
    (doc) => {
      const length = plainTextOf(doc).length;
      return length > 0 && length <= max;
    },
    { message: `Nội dung phải có chữ và tối đa ${max} ký tự` },
  );

const itemId = z.string().regex(/^[a-z][a-z0-9]{0,9}$/);

const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((i) => i.id)).size === items.length;

const optionSchema = z.strictObject({ id: itemId, content: textOf(ITEM_MAX_CHARS) });
const optionsSchema = z.array(optionSchema).min(2).max(8).refine(uniqueIds, 'id trùng');

const choiceBase = { options: optionsSchema, shuffleOptions: z.boolean() };

const keyIn = (options: { id: string }[], key: string[]) =>
  new Set(key).size === key.length && key.every((id) => options.some((o) => o.id === id));

const singleChoicePayload = z
  .strictObject({ ...choiceBase, key: z.array(itemId).length(1) })
  .refine((p) => keyIn(p.options, p.key), {
    path: ['key'],
    message: 'Đáp án không thuộc Phương án',
  });

const multipleChoicePayload = z
  .strictObject({
    ...choiceBase,
    key: z.array(itemId).min(1).max(8),
    scoringRule: z.enum(['proportional', 'all_or_nothing']),
  })
  .refine((p) => keyIn(p.options, p.key), {
    path: ['key'],
    message: 'Đáp án không thuộc Phương án',
  });

const statementSchema = z.strictObject({
  id: itemId,
  content: textOf(ITEM_MAX_CHARS),
  key: z.boolean(),
});

const clusterPayload = z
  .strictObject({
    statements: z.array(statementSchema).min(1).max(8).refine(uniqueIds, 'id trùng'),
    scoringRule: z.enum(['proportional', 'all_or_nothing', 'ladder']),
    ladder: z.array(z.number().min(0).max(1)).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.scoringRule !== 'ladder') {
      if (p.ladder !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['ladder'],
          message: 'Chỉ quy tắc Bậc thang mới có ladder',
        });
      }
      return;
    }
    const ladder = p.ladder;
    const valid =
      ladder !== undefined &&
      ladder.length === p.statements.length + 1 &&
      ladder[0] === 0 &&
      ladder[ladder.length - 1] === 1 &&
      ladder.every((value, i) => i === 0 || value >= (ladder[i - 1] as number));
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        path: ['ladder'],
        message: 'Bậc thang dài (số Mệnh đề + 1), từ 0 đến 1, không giảm dần',
      });
    }
  });

const essayPayload = z.strictObject({
  maxLength: z.number().int().min(100).max(5000),
  rubric: richTextSchema.optional(),
});

export const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const tagsSchema = z
  .array(z.string().transform(normalizeTag).pipe(z.string().min(1).max(TAG_MAX_CHARS)))
  .transform((tags) => [...new Set(tags)])
  .pipe(z.array(z.string()).max(TAGS_MAX));

const common = {
  topicId: z.uuid(),
  stem: textOf(STEM_MAX_CHARS),
  defaultPoints: z.number().min(POINTS_MIN).max(POINTS_MAX).multipleOf(POINTS_STEP),
  tags: tagsSchema,
};

// Hình dạng tối thiểu của Câu hỏi để duyệt nội dung; không dùng `QuestionInput` vì schema còn gọi hàm này (vòng kiểu).
type RichTextHolder = { stem: RichText } & (
  | { type: 'single_choice' | 'multiple_choice'; payload: { options: { content: RichText }[] } }
  | { type: 'true_false_cluster'; payload: { statements: { content: RichText }[] } }
  | { type: 'essay'; payload: { rubric?: RichText } }
);

/** Mọi nội dung có định dạng của Câu hỏi kèm đường dẫn trường: Phần dẫn, Phương án, Mệnh đề, hướng dẫn chấm. */
export function richTextFieldsOf(question: RichTextHolder): { path: string; doc: RichText }[] {
  const fields = [{ path: 'stem', doc: question.stem }];
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    for (const [i, option] of question.payload.options.entries()) {
      fields.push({ path: `payload.options.${i}.content`, doc: option.content });
    }
  } else if (question.type === 'true_false_cluster') {
    for (const [i, statement] of question.payload.statements.entries()) {
      fields.push({ path: `payload.statements.${i}.content`, doc: statement.content });
    }
  } else if (question.type === 'essay' && question.payload.rubric) {
    fields.push({ path: 'payload.rubric', doc: question.payload.rubric });
  }
  return fields;
}

export const questionInputSchema = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('single_choice'), ...common, payload: singleChoicePayload }),
    z.strictObject({
      type: z.literal('multiple_choice'),
      ...common,
      payload: multipleChoicePayload,
    }),
    z.strictObject({ type: z.literal('true_false_cluster'), ...common, payload: clusterPayload }),
    z.strictObject({ type: z.literal('essay'), ...common, payload: essayPayload }),
  ])
  .refine(
    (q) => {
      const formulas = richTextFieldsOf(q).flatMap((field) => mathNodesOf(field.doc));
      return (
        formulas.length <= MATH_MAX_PER_QUESTION &&
        formulas.reduce((sum, f) => sum + f.latex.length, 0) <= MATH_MAX_TOTAL_CHARS
      );
    },
    {
      message: `Tối đa ${MATH_MAX_PER_QUESTION} công thức và ${MATH_MAX_TOTAL_CHARS} ký tự công thức trong một Câu hỏi`,
    },
  )
  .refine(
    (q) => richTextFieldsOf(q).flatMap((f) => imageNodesOf(f.doc)).length <= IMAGE_MAX_PER_QUESTION,
    {
      message: `Tối đa ${IMAGE_MAX_PER_QUESTION} hình minh họa trong một Câu hỏi`,
    },
  );

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type SingleChoicePayload = z.infer<typeof singleChoicePayload>;
export type MultipleChoicePayload = z.infer<typeof multipleChoicePayload>;
export type ClusterPayload = z.infer<typeof clusterPayload>;
export type EssayPayload = z.infer<typeof essayPayload>;

/** Văn bản tìm kiếm: Phần dẫn, Phương án, Mệnh đề (không gồm hướng dẫn chấm), đã chuẩn hóa không dấu. */
export function searchTextOf(question: QuestionInput): string {
  const parts: RichText[] = [question.stem];
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    parts.push(...question.payload.options.map((o) => o.content));
  } else if (question.type === 'true_false_cluster') {
    parts.push(...question.payload.statements.map((s) => s.content));
  }
  return normalizeForSearch(parts.map(plainTextOf).join(' '));
}
