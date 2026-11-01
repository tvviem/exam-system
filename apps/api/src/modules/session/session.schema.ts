import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn, timestamps } from '../../db/columns';
import { exams } from '../exam/exam.schema';
import { users } from '../identity/identity.schema';

export const attemptScoringEnum = pgEnum('attempt_scoring', ['highest', 'latest']);

/**
 * Phiên thi (Q192–Q222, docs/plan/slice-4.md). Trạng thái hiện cho Người ra đề không lưu mà suy ra từ giờ và hai cột
 * `entry_closed_at`, `cancelled_at` (hàm `phaseOf` ở `@exam/shared`). Mã vào thi không trùng giữa hai Phiên thi chưa hủy
 * có Khung giờ chồng nhau: ràng buộc loại trừ và các trigger nằm trong migration 0012 (Drizzle không biểu diễn được).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** Cắt cứng (Q208): Lượt kết thúc đúng lúc đóng Khung giờ. */
    hardClose: boolean('hard_close').notNull().default(false),
    maxAttempts: integer('max_attempts').notNull().default(1),
    attemptScoring: attemptScoringEnum('attempt_scoring').notNull().default('highest'),
    shuffleItems: boolean('shuffle_items').notNull().default(false),
    shuffleOptions: boolean('shuffle_options').notNull().default(false),
    showScoringRules: boolean('show_scoring_rules').notNull().default(false),
    accessCode: text('access_code').notNull(),
    entryClosedAt: timestamp('entry_closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    /** Khóa lạc quan khi sửa từ hai nơi. */
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    check('sessions_window_check', sql`${t.closesAt} > ${t.opensAt}`),
    check('sessions_duration_check', sql`${t.durationMinutes} BETWEEN 1 AND 600`),
    check('sessions_attempts_check', sql`${t.maxAttempts} BETWEEN 1 AND 5`),
    check('sessions_access_code_check', sql`${t.accessCode} ~ '^[A-Z0-9]{4,12}$'`),
    index('sessions_owner_opens_idx').on(t.ownerId, t.opensAt),
    index('sessions_exam_idx').on(t.examId),
  ],
);

/** Danh sách dự thi (Q200). `class_label` là Lớp chụp tại lúc thêm, không đổi theo hồ sơ sau đó. */
export const sessionRoster = pgTable(
  'session_roster',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    classLabel: text('class_label'),
    /** Phút cộng sẵn cho riêng người này (ví dụ hỗ trợ đặc biệt). */
    extraMinutes: integer('extra_minutes').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId] }),
    check('session_roster_extra_check', sql`${t.extraMinutes} BETWEEN 0 AND 600`),
    index('session_roster_user_idx').on(t.userId),
  ],
);
