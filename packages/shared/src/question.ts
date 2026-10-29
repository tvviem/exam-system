import { z } from 'zod';
import { normalizeForSearch, plainTextOf, type RichText, richTextSchema } from './rich-text.js';

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
export const POINTS_MIN = 0.25;
export const POINTS_MAX = 100;
export const TAGS_MAX = 10;
export const TAG_MAX_CHARS = 30;

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

const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const tagsSchema = z
  .array(z.string().transform(normalizeTag).pipe(z.string().min(1).max(TAG_MAX_CHARS)))
  .transform((tags) => [...new Set(tags)])
  .pipe(z.array(z.string()).max(TAGS_MAX));

const common = {
  topicId: z.uuid(),
  stem: textOf(STEM_MAX_CHARS),
  defaultPoints: z.number().min(POINTS_MIN).max(POINTS_MAX).multipleOf(0.25),
  tags: tagsSchema,
};

export const questionInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('single_choice'), ...common, payload: singleChoicePayload }),
  z.strictObject({ type: z.literal('multiple_choice'), ...common, payload: multipleChoicePayload }),
  z.strictObject({ type: z.literal('true_false_cluster'), ...common, payload: clusterPayload }),
  z.strictObject({ type: z.literal('essay'), ...common, payload: essayPayload }),
]);

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
