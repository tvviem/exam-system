import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
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
