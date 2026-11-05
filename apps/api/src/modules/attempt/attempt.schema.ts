import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn } from '../../db/columns';
import { examItems } from '../exam/exam.schema';
import { users } from '../identity/identity.schema';
import { sessionRoster, sessions } from '../session/session.schema';

export const deviceStatusEnum = pgEnum('device_status', ['active', 'revoked']);
export const attemptStatusEnum = pgEnum('attempt_status', ['in_progress', 'submitted']);
export const attemptSubmitReasonEnum = pgEnum('attempt_submit_reason', [
  'candidate',
  'timeout',
  'examiner',
  'disqualified',
  'account_locked',
  'session_cancelled',
]);

/** Bố cục của một Lượt (`layoutOf` ở `@exam/shared`): thứ tự câu và Phương án, cố định suốt Lượt. */
export interface StoredLayout {
  sections: { sectionId: string; items: { itemId: string; optionOrder?: string[] }[] }[];
}

/**
 * Thiết bị dự thi (ADR-0007, Q192–Q194, Q234): mỗi Người dự thi trong một Phiên thi có tối đa một thiết bị đang gắn, và
 * một thiết bị chỉ phục vụ một người. Bớt người khỏi Danh sách (chưa có Lượt) thì dòng gắn đi theo (CASCADE).
 */
export const sessionDevices = pgTable(
  'session_devices',
  {
    id: idColumn(),
    sessionId: uuid('session_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** SHA-256 của cookie `exam_did`; server không giữ giá trị gốc. */
    deviceHash: text('device_hash').notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    status: deviceStatusEnum('status').notNull().default('active'),
    boundAt: timestamp('bound_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    revokeReason: text('revoke_reason'),
    /** Lần gần nhất Người ra đề "Cho thiết bị này vào lại". */
    pardonedAt: timestamp('pardoned_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.userId],
      foreignColumns: [sessionRoster.sessionId, sessionRoster.userId],
    }).onDelete('cascade'),
    unique('session_devices_triple_unique').on(t.sessionId, t.userId, t.deviceHash),
    uniqueIndex('session_devices_one_active_per_user')
      .on(t.sessionId, t.userId)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex('session_devices_one_user_per_device')
      .on(t.sessionId, t.deviceHash)
      .where(sql`${t.status} = 'active'`),
  ],
);

/**
 * Lượt làm bài (Q192–Q236). `deadline` là nguồn sự thật của hạn nộp (server quyết định, Q212). Người đã có Lượt không bị
 * bớt khỏi Danh sách (khóa ngoại ghép RESTRICT, Q228). Lát cắt 5 thêm cột điểm.
 */
export const attempts = pgTable(
  'attempts',
  {
    id: idColumn(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    attemptNo: integer('attempt_no').notNull(),
    /** Hạt giống 48 bit của `layoutOf`. */
    seed: bigint('seed', { mode: 'number' }).notNull(),
    layout: jsonb('layout').$type<StoredLayout>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submitReason: attemptSubmitReasonEnum('submit_reason'),
    status: attemptStatusEnum('status').notNull().default('in_progress'),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.userId],
      foreignColumns: [sessionRoster.sessionId, sessionRoster.userId],
    }).onDelete('restrict'),
    unique('attempts_session_user_no_unique').on(t.sessionId, t.userId, t.attemptNo),
    uniqueIndex('attempts_one_in_progress')
      .on(t.sessionId, t.userId)
      .where(sql`${t.status} = 'in_progress'`),
    index('attempts_sweep_idx').on(t.status, t.deadline).where(sql`${t.status} = 'in_progress'`),
    index('attempts_user_idx').on(t.userId),
    check('attempts_no_check', sql`${t.attemptNo} >= 1`),
    check('attempts_deadline_check', sql`${t.deadline} > ${t.startedAt}`),
    check(
      'attempts_submitted_check',
      sql`(${t.status} = 'submitted') = (${t.submittedAt} IS NOT NULL AND ${t.submitReason} IS NOT NULL)`,
    ),
  ],
);

/** Câu trả lời của một Lượt; `client_seq` làm lệnh lưu idempotent (Q216). */
export const responses = pgTable(
  'responses',
  {
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => examItems.id, { onDelete: 'restrict' }),
    /** Hình dạng theo Loại câu (`responseSchemaFor` ở `@exam/shared`); `null` là bỏ trả lời. */
    value: jsonb('value'),
    clientSeq: integer('client_seq').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
    flagged: boolean('flagged').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.itemId] }),
    check('responses_seq_check', sql`${t.clientSeq} >= 0`),
  ],
);

export const sessionEventTypeEnum = pgEnum('session_event_type', [
  'tab_hidden',
  'tab_visible',
  'went_offline',
  'back_online',
  'device_rejected',
]);
export const timeExtensionScopeEnum = pgEnum('time_extension_scope', ['one', 'group', 'all']);
/**
 * Nhật ký Hoàn tác Buộc nộp (Q273–Q280): mỗi dòng là một lần mở lại Lượt bị Buộc nộp nhầm. Chỉ ghi thêm. Trigger
 * `attempts_guard` chỉ cho Lượt đã nộp mở lại khi có dòng khớp lần nộp (`previous_submitted_at`) và hạn mới (`new_deadline`).
 */
export const attemptReopenings = pgTable(
  'attempt_reopenings',
  {
    id: idColumn(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    reopenedBy: uuid('reopened_by')
      .notNull()
      .references(() => users.id),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }).notNull().defaultNow(),
    previousSubmittedAt: timestamp('previous_submitted_at', { withTimezone: true }).notNull(),
    newDeadline: timestamp('new_deadline', { withTimezone: true }).notNull(),
  },
  (t) => [unique('attempt_reopenings_once').on(t.attemptId, t.previousSubmittedAt)],
);

export const violationActionEnum = pgEnum('violation_action', ['warning', 'disqualify']);
export const violationPenaltyTypeEnum = pgEnum('violation_penalty_type', [
  'none',
  'percent',
  'void',
]);

/**
 * Sự kiện bất thường trong Phiên thi (Q198): chỉ ghi nhận, không sửa, không xóa (trigger). `at` là giờ server nhận.
 * `attempt_id` rỗng khi người bị từ chối thiết bị chưa có Lượt.
 */
export const sessionEvents = pgTable(
  'session_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    attemptId: uuid('attempt_id').references(() => attempts.id, { onDelete: 'restrict' }),
    type: sessionEventTypeEnum('type').notNull(),
    data: jsonb('data'),
    /** Mã sự kiện do trình duyệt sinh: gửi lại heartbeat không ghi trùng sự kiện. */
    clientEventId: uuid('client_event_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('session_events_client_event_unique')
      .on(t.attemptId, t.clientEventId)
      .where(sql`${t.clientEventId} IS NOT NULL`),
    index('session_events_attempt_idx').on(t.attemptId, t.type),
    index('session_events_session_idx').on(t.sessionId, t.at),
  ],
);

/**
 * Nhật ký Cộng giờ (Q254, Q256, Q262): một dòng cho mỗi Lượt được cộng. `batch_id` do giao diện sinh nên thử lại cùng
 * yêu cầu không cộng hai lần. Chỉ ghi thêm (trigger).
 */
export const attemptTimeExtensions = pgTable(
  'attempt_time_extensions',
  {
    id: idColumn(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    minutes: integer('minutes').notNull(),
    scope: timeExtensionScopeEnum('scope').notNull(),
    reason: text('reason').notNull(),
    batchId: uuid('batch_id').notNull(),
    extendedBy: uuid('extended_by')
      .notNull()
      .references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('attempt_time_extensions_batch_unique').on(t.attemptId, t.batchId),
    check('attempt_time_extensions_minutes_check', sql`${t.minutes} BETWEEN 1 AND 180`),
    check('attempt_time_extensions_reason_check', sql`char_length(${t.reason}) BETWEEN 1 AND 200`),
  ],
);

/**
 * Vi phạm (Q259): Cảnh cáo hoặc Đình chỉ, bắt buộc lý do. Các cột hình phạt để lát cắt 5 quyết định (mặc định không
 * phạt); hành động, lý do và Lượt không đổi sau khi ghi (trigger).
 */
export const violations = pgTable(
  'violations',
  {
    id: idColumn(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    action: violationActionEnum('action').notNull(),
    reason: text('reason').notNull(),
    penaltyType: violationPenaltyTypeEnum('penalty_type').notNull().default('none'),
    penaltyPercent: numeric('penalty_percent', { precision: 5, scale: 2 }),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    penaltyDecidedAt: timestamp('penalty_decided_at', { withTimezone: true }),
  },
  (t) => [
    index('violations_attempt_idx').on(t.attemptId),
    index('violations_session_user_idx').on(t.sessionId, t.userId),
    check('violations_reason_check', sql`char_length(${t.reason}) BETWEEN 1 AND 500`),
    check(
      'violations_penalty_check',
      sql`(${t.penaltyType} = 'percent') = (${t.penaltyPercent} IS NOT NULL) AND (${t.penaltyPercent} IS NULL OR ${t.penaltyPercent} BETWEEN 0 AND 100)`,
    ),
  ],
);
