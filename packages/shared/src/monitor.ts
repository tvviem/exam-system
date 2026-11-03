import { z } from 'zod';

// Luật thuần của màn Theo dõi và các thao tác của Người ra đề (docs/plan/slice-4.md, Q252–Q262).

/** Quá số giây này không có heartbeat thì coi là mất kết nối (Q261). */
export const ATTENTION_OFFLINE_SECONDS = 45;

/** Rời màn hình làm bài từ số lần này trở lên thì đáng chú ý (Q261). */
export const ATTENTION_HIDDEN_COUNT = 3;

/** Chỉ xét làm chậm sau khi đã qua phần thời gian này (Q261). */
export const ATTENTION_SLOW_AFTER = 0.25;
/** Làm chậm: tỉ lệ đã trả lời thấp hơn tỉ lệ thời gian đã trôi quá số điểm này (Q261). */
export const ATTENTION_SLOW_GAP = 0.3;

export type AttentionReason = 'disconnected' | 'hidden' | 'device' | 'slow';

export interface AttentionInput {
  inProgress: boolean;
  startedAt: Date;
  deadline: Date;
  now: Date;
  /** Lần heartbeat cuối; `null` nếu chưa có thì tính từ lúc bắt đầu. */
  lastSeenAt: Date | null;
  /** Số lần rời màn hình làm bài. */
  hiddenCount: number;
  device: 'ok' | 'new' | 'revoked';
  /** Tỉ lệ số câu đã trả lời trên tổng số câu, từ 0 đến 1. */
  answeredFraction: number;
}

/** Các dấu hiệu khiến một Lượt đang làm đáng được Người ra đề xem; chỉ là gợi ý, không phải Vi phạm. */
export function attentionReasonsOf(input: AttentionInput): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (!input.inProgress) return reasons;
  const seen = (input.lastSeenAt ?? input.startedAt).getTime();
  if (input.now.getTime() - seen > ATTENTION_OFFLINE_SECONDS * 1000) reasons.push('disconnected');
  if (input.hiddenCount >= ATTENTION_HIDDEN_COUNT) reasons.push('hidden');
  if (input.device !== 'ok') reasons.push('device');
  const total = input.deadline.getTime() - input.startedAt.getTime();
  const elapsed = total > 0 ? (input.now.getTime() - input.startedAt.getTime()) / total : 0;
  if (elapsed > ATTENTION_SLOW_AFTER && input.answeredFraction < elapsed - ATTENTION_SLOW_GAP)
    reasons.push('slow');
  return reasons;
}

/** Một lần Cộng giờ thêm từ 1 đến số phút này (Q256). */
export const EXTEND_MINUTES_MAX = 180;
/** Tổng phần Cộng giờ của một Lượt không quá số phút này, cùng trần với giờ cộng sẵn (Q256). */
export const EXTEND_TOTAL_MINUTES_MAX = 600;
export const EXTEND_REASON_MAX = 200;
export const VIOLATION_REASON_MAX = 500;
/** Số Lượt tối đa trong một thao tác nhóm, bằng cỡ Phiên thi lớn nhất cần chịu tải (500 người). */
export const GROUP_MAX_ATTEMPTS = 500;

const reasonOf = (max: number) => z.string().trim().min(1).max(max);

/**
 * Yêu cầu Cộng giờ cho một Lượt, một nhóm hoặc cả phòng (Q254). `batchId` do giao diện sinh để thử lại không cộng
 * hai lần (Q262).
 */
export const extendTimeSchema = z
  .strictObject({
    attemptIds: z.array(z.uuid()).min(1).max(GROUP_MAX_ATTEMPTS).optional(),
    scope: z.literal('all').optional(),
    minutes: z.number().int().min(1).max(EXTEND_MINUTES_MAX),
    reason: reasonOf(EXTEND_REASON_MAX),
    batchId: z.uuid(),
  })
  .refine((request) => (request.attemptIds === undefined) !== (request.scope === undefined));
export type ExtendTimeRequest = z.infer<typeof extendTimeSchema>;

/** Hạn mới sau Cộng giờ. Cắt cứng không chặn Cộng giờ (GLOSSARY). */
export function extendedDeadline(deadline: Date, minutes: number): Date {
  return new Date(deadline.getTime() + minutes * 60_000);
}

/** Phần đã cộng cộng với lần này có còn trong trần không (Q256). */
export function extensionWithinCap(alreadyMinutes: number, minutes: number): boolean {
  return alreadyMinutes + minutes <= EXTEND_TOTAL_MINUTES_MAX;
}

/** Cảnh cáo (vẫn làm tiếp) hoặc Đình chỉ (nộp ngay), cả hai đều bắt buộc lý do (Q259). */
export const violationSchema = z.strictObject({
  action: z.enum(['warning', 'disqualify']),
  reason: reasonOf(VIOLATION_REASON_MAX),
});
export type ViolationRequest = z.infer<typeof violationSchema>;
