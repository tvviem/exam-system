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

/** Công bố kết quả (Q298): hạn Phúc khảo theo ngày, 0 là không nhận Phúc khảo (Chốt ngay), tối đa 14 ngày. */
export const releaseSchema = z.strictObject({ appealPeriodDays: z.number().int().min(0).max(14) });
export type ReleaseRequest = z.infer<typeof releaseSchema>;

export const reviewAfterReleaseSchema = z.strictObject({ reviewAfterRelease: z.boolean() });

export const APPEAL_HOURS_PER_DAY = 24;

/** Số ngày tối đa của Thời hạn phúc khảo tính từ lúc Công bố, kể cả sau khi gia hạn (Q298, Q314). */
export const APPEAL_MAX_DAYS = 14;
export const APPEAL_REASON_MIN = 10;
export const APPEAL_TEXT_MAX = 1000;

/**
 * Hạn mức Phúc khảo của mỗi Người dự thi trong một Phiên thi (Q311): 10 % số câu của Bộ đề làm tròn lên, ít nhất 3. Một Chùm
 * đúng/sai tính là một câu. Phúc khảo về Mức xử lý tính chung vào hạn mức.
 */
export const appealLimitOf = (itemCount: number): number =>
  Math.max(3, Math.ceil(Math.max(0, itemCount) * 0.1));

const appealReasonSchema = z.string().trim().min(APPEAL_REASON_MIN).max(APPEAL_TEXT_MAX);

/**
 * Người dự thi gửi Phúc khảo (Q300, Q312): một câu (theo số "Câu N" họ đã thấy) hoặc một Mức xử lý Vi phạm của họ. Mỗi đối tượng
 * một lần, không rút được.
 */
export const createAppealSchema = z.discriminatedUnion('target', [
  z.strictObject({
    target: z.literal('response'),
    no: z.number().int().min(1),
    reason: appealReasonSchema,
  }),
  z.strictObject({
    target: z.literal('penalty'),
    violationId: z.uuid(),
    reason: appealReasonSchema,
  }),
]);
export type CreateAppealRequest = z.infer<typeof createAppealSchema>;

/**
 * Người ra đề xử lý Phúc khảo (Q300, Q310): trả lời bắt buộc, kèm điểm mới của câu hoặc Mức xử lý mới (giữ điểm thì gửi lại điểm
 * hiện tại).
 */
export const resolveAppealSchema = z.union([
  z.strictObject({
    response: z.string().trim().min(1).max(APPEAL_TEXT_MAX),
    score: manualScoreSchema,
  }),
  z.strictObject({
    response: z.string().trim().min(1).max(APPEAL_TEXT_MAX),
    penalty: penaltySchema,
  }),
]);
export type ResolveAppealRequest = z.infer<typeof resolveAppealSchema>;

/** Gia hạn Thời hạn phúc khảo (Q314): tổng số ngày kể từ lúc Công bố, chỉ tăng, tối đa 14. */
export const extendAppealPeriodSchema = z.strictObject({
  appealPeriodDays: z.number().int().min(1).max(APPEAL_MAX_DAYS),
});
export type ExtendAppealPeriodRequest = z.infer<typeof extendAppealPeriodSchema>;

/** Lý do chưa Công bố được (Q298), khớp `reason` của lỗi `409 INVALID_STATE`; theo thứ tự ưu tiên khi báo. */
export const RELEASE_BLOCKERS = [
  'ALREADY_RELEASED',
  'SESSION_CANCELLED',
  'SESSION_NOT_FINISHED',
  'NO_ATTEMPTS',
  'UNGRADED_ATTEMPTS',
  'ESSAYS_PENDING',
] as const;
export type ReleaseBlocker = (typeof RELEASE_BLOCKERS)[number];

/**
 * Phiên thi đã kết thúc để Công bố (Q298): không còn Lượt đang làm, và đã quá Khung giờ hoặc đã Đóng cửa vào thi (không ai vào
 * được nữa).
 */
export const isSessionFinished = (input: {
  now: Date;
  closesAt: Date;
  entryClosedAt: Date | null;
  inProgressAttempts: number;
}): boolean =>
  input.inProgressAttempts === 0 &&
  (input.now.getTime() >= input.closesAt.getTime() || input.entryClosedAt !== null);

/** Các lý do đang chặn Công bố, theo thứ tự ưu tiên; rỗng nghĩa là Công bố được. */
export function releaseBlockers(input: {
  released: boolean;
  cancelled: boolean;
  finished: boolean;
  submittedAttempts: number;
  ungradedAttempts: number;
  pendingEssays: number;
}): ReleaseBlocker[] {
  const blockers: ReleaseBlocker[] = [];
  if (input.released) blockers.push('ALREADY_RELEASED');
  if (input.cancelled) blockers.push('SESSION_CANCELLED');
  if (!input.finished) blockers.push('SESSION_NOT_FINISHED');
  if (input.submittedAttempts === 0) blockers.push('NO_ATTEMPTS');
  if (input.ungradedAttempts > 0) blockers.push('UNGRADED_ATTEMPTS');
  if (input.pendingEssays > 0) blockers.push('ESSAYS_PENDING');
  return blockers;
}

/** Mức đạt của một Kết quả để tô màu (màn "Kết quả của tôi"): dưới 50 %, 50–69 %, 70–89 %, từ 90 %. */
export type ResultBand = 'low' | 'fair' | 'good' | 'excellent';

export function resultBandOf(percent: number): ResultBand {
  if (percent < 50) return 'low';
  if (percent < 70) return 'fair';
  if (percent < 90) return 'good';
  return 'excellent';
}
