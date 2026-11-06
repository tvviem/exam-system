import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { attempts } from '../attempt/attempt.schema';
import { examItems } from '../exam/exam.schema';
import { users } from '../identity/identity.schema';

// Điểm nằm ở bảng riêng của `grading` (ADR-0008, Q285): bài làm đã nộp vẫn bị trigger khóa, chấm lại bao nhiêu lần cũng không
// đụng bài gốc.

export const responseGradeSourceEnum = pgEnum('response_grade_source', [
  'auto',
  'manual',
  'appeal',
  'correction',
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
