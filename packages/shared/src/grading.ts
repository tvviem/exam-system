import { z } from 'zod';

// Chấm tay, Mức xử lý và Ủy quyền chấm (docs/plan/slice-5.md, PR 5b), dùng chung cho api và web.

/** Điểm một câu tự luận: số không âm, tối đa 2 chữ số thập phân (Q287, Q290); `null` đưa câu về chờ chấm. */
export const manualScoreSchema = z
  .number()
  .min(0)
  .max(1000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
    message: 'Điểm tối đa 2 chữ số thập phân',
  });

export const FEEDBACK_MAX_CHARS = 1000;

export const saveGradeSchema = z.strictObject({
  score: manualScoreSchema.nullable(),
  feedback: z.string().max(FEEDBACK_MAX_CHARS).nullish(),
});
export type SaveGradeRequest = z.infer<typeof saveGradeSchema>;

export const blindGradingSchema = z.strictObject({ blind: z.boolean() });

/** Mức xử lý của một Vi phạm (Q294). */
export const penaltySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  z.strictObject({
    type: z.literal('percent'),
    percent: z
      .number()
      .min(1)
      .max(100)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
        message: 'Phần trăm tối đa 2 chữ số thập phân',
      }),
  }),
  z.strictObject({ type: z.literal('void') }),
]);
export type PenaltyRequest = z.infer<typeof penaltySchema>;

export const gradingDelegateSchema = z.strictObject({ userId: z.uuid() });

/** Nhãn "Bài N" trong hàng đợi chấm ẩn tên. */
export const blindLabelOf = (rank: number): string => `Bài ${rank}`;
