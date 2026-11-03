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
  device: DeviceState;
  /** Tỉ lệ số câu đã trả lời trên tổng số câu, từ 0 đến 1. */
  answeredFraction: number;
}

/** Quá 45 giây không có nhịp (hoặc, chưa có nhịp nào, kể từ lúc bắt đầu) thì coi là mất kết nối (Q261). */
export function isDisconnected(lastSeenAt: Date | null, startedAt: Date, now: Date): boolean {
  return now.getTime() - (lastSeenAt ?? startedAt).getTime() > ATTENTION_OFFLINE_SECONDS * 1000;
}

export type MonitorState = 'not_started' | 'working' | 'disconnected' | 'submitted' | 'suspended';

/** Trạng thái một người trên màn Theo dõi, từ Lượt mới nhất của họ (`null` là chưa có Lượt). */
export function monitorStateOf(
  attempt: {
    status: 'in_progress' | 'submitted';
    submitReason: string | null;
    startedAt: Date;
    lastSeenAt: Date | null;
  } | null,
  now: Date,
): MonitorState {
  if (!attempt) return 'not_started';
  if (attempt.status === 'in_progress') {
    return isDisconnected(attempt.lastSeenAt, attempt.startedAt, now) ? 'disconnected' : 'working';
  }
  return attempt.submitReason === 'disqualified' ? 'suspended' : 'submitted';
}

export type DeviceState = 'none' | 'ok' | 'new' | 'revoked';

/**
 * Thiết bị của một người so với Lượt của họ: `none` chưa gắn thiết bị, `revoked` chỉ còn thiết bị đã Thu hồi, `new`
 * thiết bị đang gắn được gắn sau khi Lượt bắt đầu (làm tiếp trên máy khác sau Thu hồi), còn lại `ok`.
 */
export function deviceStateOf(
  devices: readonly { status: 'active' | 'revoked'; boundAt: Date }[],
  attemptStartedAt: Date | null,
): DeviceState {
  if (devices.length === 0) return 'none';
  const active = devices.find((device) => device.status === 'active');
  if (!active) return 'revoked';
  return attemptStartedAt && active.boundAt > attemptStartedAt ? 'new' : 'ok';
}

/** Các dấu hiệu khiến một Lượt đang làm đáng được Người ra đề xem; chỉ là gợi ý, không phải Vi phạm. */
export function attentionReasonsOf(input: AttentionInput): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (!input.inProgress) return reasons;
  if (isDisconnected(input.lastSeenAt, input.startedAt, input.now)) reasons.push('disconnected');
  if (input.hiddenCount >= ATTENTION_HIDDEN_COUNT) reasons.push('hidden');
  if (input.device === 'new' || input.device === 'revoked') reasons.push('device');
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

// Chọn Lượt cho một thao tác của Người ra đề: danh sách Lượt (một hoặc một nhóm) hoặc cả phòng, đúng một cách (Q254).
const targetShape = {
  attemptIds: z.array(z.uuid()).min(1).max(GROUP_MAX_ATTEMPTS).optional(),
  scope: z.literal('all').optional(),
};
const exactlyOneTarget = (request: { attemptIds?: unknown; scope?: unknown }) =>
  (request.attemptIds === undefined) !== (request.scope === undefined);

/**
 * Yêu cầu Cộng giờ cho một Lượt, một nhóm hoặc cả phòng (Q254). `batchId` do giao diện sinh để thử lại không cộng
 * hai lần (Q262).
 */
export const extendTimeSchema = z
  .strictObject({
    ...targetShape,
    minutes: z.number().int().min(1).max(EXTEND_MINUTES_MAX),
    reason: reasonOf(EXTEND_REASON_MAX),
    batchId: z.uuid(),
  })
  .refine(exactlyOneTarget);
/** Yêu cầu Buộc nộp một Lượt, một nhóm hoặc cả phòng (Q254). Làm lại cùng yêu cầu không đổi gì thêm. */
export const forceSubmitSchema = z.strictObject(targetShape).refine(exactlyOneTarget);
export type ForceSubmitRequest = z.infer<typeof forceSubmitSchema>;

export type ExtendTimeRequest = z.infer<typeof extendTimeSchema>;

export type ExtensionScope = 'one' | 'group' | 'all';

/** Phạm vi của một lần Cộng giờ: `null` là cả phòng, một Lượt là `one`, nhiều Lượt là `group` (Q254). */
export function extensionScopeOf(attemptIds: readonly string[] | null): ExtensionScope {
  if (attemptIds === null) return 'all';
  return attemptIds.length === 1 ? 'one' : 'group';
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

/** Số sự kiện tối đa mà một nhịp heartbeat mang theo. */
export const HEARTBEAT_EVENTS_MAX = 20;

/** Loại sự kiện trình duyệt báo qua heartbeat (còn `device_rejected` do server ghi). */
export const HEARTBEAT_EVENT_TYPES = [
  'tab_hidden',
  'tab_visible',
  'went_offline',
  'back_online',
] as const;
export type HeartbeatEventType = (typeof HEARTBEAT_EVENT_TYPES)[number];

/**
 * Nhịp báo còn làm bài mỗi 15 giây (Q213). Mỗi sự kiện mang mã UUID do trình duyệt sinh nên gửi lại không ghi trùng.
 * `since` là mốc `cursor` của lần trả lời trước, để nhận thông báo mới (Cộng giờ, Cảnh cáo).
 */
export const heartbeatSchema = z.strictObject({
  events: z
    .array(z.strictObject({ id: z.uuid(), type: z.enum(HEARTBEAT_EVENT_TYPES) }))
    .max(HEARTBEAT_EVENTS_MAX)
    .default([]),
  since: z.iso.datetime({ offset: true }).optional(),
});
export type HeartbeatRequest = z.infer<typeof heartbeatSchema>;
