import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn } from '../../db/columns';
import { attempts } from '../attempt/attempt.schema';
import { examItems } from '../exam/exam.schema';
import { users } from '../identity/identity.schema';
import { sessions } from '../session/session.schema';

// Điểm nằm ở bảng riêng của `grading` (ADR-0008, Q285): bài làm đã nộp vẫn bị trigger khóa, chấm lại bao nhiêu lần cũng không
// đụng bài gốc.

export const responseGradeSourceEnum = pgEnum('response_grade_source', [
  'auto',
  'manual',
  'appeal',
  'correction',
]);

export const responseVerdictEnum = pgEnum('response_verdict', [
  'correct',
  'partial',
  'wrong',
  'blank',
  'pending',
]);

/**
 * Một dòng cho MỖI câu của Bộ đề trong mỗi Lượt đã chấm (kể cả câu bỏ trống). `score` NULL là Câu tự luận có nội dung đang chờ
 * chấm tay. Làm tròn đến 0,01 (Q287).
 */
export const responseGrades = pgTable(
  'response_grades',
  {
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => examItems.id, { onDelete: 'restrict' }),
    score: numeric('score', { precision: 6, scale: 2 }),
    /** Kết luận của câu (Thống kê câu, bảng Kết quả): chấm tự động ghi từ `scoreResponse`, chấm tay tính lại từ điểm. */
    verdict: responseVerdictEnum('verdict').notNull(),
    source: responseGradeSourceEnum('source').notNull(),
    gradedBy: uuid('graded_by').references(() => users.id),
    gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
    feedback: text('feedback'),
  },
  (t) => [
    primaryKey({ columns: [t.attemptId, t.itemId] }),
    check(
      'response_grades_manual_has_grader',
      sql`${t.source} = 'auto' OR ${t.gradedBy} IS NOT NULL`,
    ),
    check(
      'response_grades_feedback_len',
      sql`${t.feedback} IS NULL OR char_length(${t.feedback}) <= 1000`,
    ),
    check('response_grades_score_range', sql`${t.score} IS NULL OR ${t.score} >= 0`),
    // Hàng đợi chấm tay (5b): các câu tự luận còn chờ điểm.
    index('response_grades_pending_idx').on(t.itemId).where(sql`${t.score} IS NULL`),
  ],
);

/** Dấu "đã chấm tự động xong" của một Lượt; job quét tìm Lượt đã nộp mà chưa có dòng này. */
export const attemptGrades = pgTable('attempt_grades', {
  attemptId: uuid('attempt_id')
    .primaryKey()
    .references(() => attempts.id, { onDelete: 'restrict' }),
  gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Thiết lập chấm của một Phiên thi (Q291): hiện chỉ có công tắc Chấm ẩn tên, mặc định bật khi chưa có dòng. */
export const sessionGradings = pgTable('session_gradings', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'restrict' }),
  blind: boolean('blind').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Ủy quyền chấm (Q307): tối đa một người hiệu lực mỗi Phiên thi; thu hồi chỉ đặt `revoked_at`. */
export const sessionGradingDelegates = pgTable(
  'session_grading_delegates',
  {
    id: idColumn(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('session_grading_delegates_active_idx')
      .on(t.sessionId)
      .where(sql`${t.revokedAt} IS NULL`),
    index('session_grading_delegates_user_idx').on(t.userId),
  ],
);
