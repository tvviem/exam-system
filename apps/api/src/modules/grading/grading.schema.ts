import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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
import { attempts, violations } from '../attempt/attempt.schema';
import { examItems, exams } from '../exam/exam.schema';
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
export const sessionGradings = pgTable(
  'session_gradings',
  {
    sessionId: uuid('session_id')
      .primaryKey()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    blind: boolean('blind').notNull().default(true),
    /** Công bố kết quả (Q298): một lần cho cả Phiên thi, không hoàn tác. */
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedBy: uuid('released_by').references(() => users.id),
    /** Thời hạn phúc khảo tính bằng giờ: 0 (không nhận) hoặc 24–336; đi cùng `released_at`. */
    appealPeriodHours: integer('appeal_period_hours'),
    /** Chốt kết quả (Q301); `0` giờ Phúc khảo thì Chốt ngay lúc Công bố. */
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    /** Lần gần nhất job Chốt nhắc Người ra đề còn Phúc khảo chờ sau hạn (Q315): nhắc lúc hết hạn rồi mỗi 24 giờ. */
    appealRemindedAt: timestamp('appeal_reminded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Job Chốt chỉ nhìn Phiên thi đang chờ Chốt, không quét lịch sử.
    index('session_gradings_finalize_idx')
      .on(t.releasedAt)
      .where(sql`${t.releasedAt} IS NOT NULL AND ${t.finalizedAt} IS NULL`),
    check(
      'session_gradings_appeal_hours',
      sql`${t.appealPeriodHours} IS NULL OR ${t.appealPeriodHours} = 0 OR ${t.appealPeriodHours} BETWEEN 24 AND 336`,
    ),
    check(
      'session_gradings_release_consistent',
      sql`(${t.releasedAt} IS NULL) = (${t.appealPeriodHours} IS NULL) AND (${t.finalizedAt} IS NULL OR ${t.releasedAt} IS NOT NULL)`,
    ),
  ],
);

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

export const appealTargetEnum = pgEnum('appeal_target', ['response', 'penalty']);
export const appealStatusEnum = pgEnum('appeal_status', ['open', 'resolved']);

/**
 * Phúc khảo (Q300, Q309–Q317): Người dự thi đề nghị xem lại điểm một câu hoặc một Mức xử lý của Lượt được tính. Mỗi đối tượng một
 * lần; Người ra đề trả lời bắt buộc và đặt điểm hay Mức xử lý mới. `session_id` và `user_id` lặp lại từ Lượt để đếm hạn mức và
 * liệt kê theo Phiên thi không phải nối bảng (trigger `appeals_guard` kiểm khớp Lượt).
 */
export const appeals = pgTable(
  'appeals',
  {
    id: idColumn(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'restrict' }),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    target: appealTargetEnum('target').notNull(),
    itemId: uuid('item_id').references(() => examItems.id, { onDelete: 'restrict' }),
    violationId: uuid('violation_id').references(() => violations.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    status: appealStatusEnum('status').notNull().default('open'),
    /** Điểm hoặc Mức xử lý trước và sau khi xử lý; chỉ có khi `resolved`. */
    previousValue: jsonb('previous_value').$type<Record<string, unknown>>(),
    newValue: jsonb('new_value').$type<Record<string, unknown>>(),
    resolverId: uuid('resolver_id').references(() => users.id),
    response: text('response'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'appeals_target_match',
      sql`(${t.target} = 'response' AND ${t.itemId} IS NOT NULL AND ${t.violationId} IS NULL) OR (${t.target} = 'penalty' AND ${t.violationId} IS NOT NULL AND ${t.itemId} IS NULL)`,
    ),
    check('appeals_reason_len', sql`char_length(${t.reason}) BETWEEN 10 AND 1000`),
    check(
      'appeals_response_len',
      sql`${t.response} IS NULL OR char_length(${t.response}) BETWEEN 1 AND 1000`,
    ),
    check(
      'appeals_resolved_consistent',
      sql`(${t.status} = 'open' AND ${t.resolverId} IS NULL AND ${t.response} IS NULL AND ${t.resolvedAt} IS NULL AND ${t.previousValue} IS NULL AND ${t.newValue} IS NULL) OR (${t.status} = 'resolved' AND ${t.resolverId} IS NOT NULL AND ${t.response} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL AND ${t.previousValue} IS NOT NULL AND ${t.newValue} IS NOT NULL)`,
    ),
    // Mỗi đối tượng chỉ Phúc khảo một lần (Q300, Q312).
    uniqueIndex('appeals_attempt_item_key')
      .on(t.attemptId, t.itemId)
      .where(sql`${t.itemId} IS NOT NULL`),
    uniqueIndex('appeals_violation_key').on(t.violationId).where(sql`${t.violationId} IS NOT NULL`),
    // Danh sách theo Phiên thi, số chờ xử lý và kiểm "còn Phúc khảo mở" của job Chốt.
    index('appeals_session_status_idx').on(t.sessionId, t.status, t.createdAt),
    // Hạn mức Phúc khảo của một người trong Phiên thi (Q311).
    index('appeals_session_user_idx').on(t.sessionId, t.userId),
  ],
);

export const keyCorrectionStatusEnum = pgEnum('key_correction_status', [
  'running',
  'done',
  'failed',
]);

/**
 * Đính chính đáp án (Q302, Q319–Q321): bản chụp `exam_items.snapshot` bất biến nên đáp án đúng mới nằm ở đây. Đáp án hiệu lực của
 * một câu là bản đính chính mới nhất; có hiệu lực ngay khi ghi, việc chấm lại các Lượt đã nộp chạy ở nền (`status`).
 */
export const keyCorrections = pgTable(
  'key_corrections',
  {
    id: idColumn(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => examItems.id, { onDelete: 'restrict' }),
    /** Đáp án hiệu lực trước và sau, dạng `KeyOverride` của `@exam/scoring`. */
    oldKey: jsonb('old_key').$type<string[] | Record<string, boolean>>().notNull(),
    newKey: jsonb('new_key').$type<string[] | Record<string, boolean>>().notNull(),
    reason: text('reason').notNull(),
    correctedBy: uuid('corrected_by')
      .notNull()
      .references(() => users.id),
    correctedAt: timestamp('corrected_at', { withTimezone: true }).notNull().defaultNow(),
    status: keyCorrectionStatusEnum('status').notNull().default('running'),
    totalAttempts: integer('total_attempts').notNull().default(0),
    processedAttempts: integer('processed_attempts').notNull().default(0),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    check('key_corrections_reason_len', sql`char_length(${t.reason}) BETWEEN 10 AND 1000`),
    check(
      'key_corrections_progress',
      sql`${t.totalAttempts} >= 0 AND ${t.processedAttempts} BETWEEN 0 AND ${t.totalAttempts}`,
    ),
    // Đáp án hiệu lực của câu = bản mới nhất.
    index('key_corrections_item_idx').on(t.itemId, t.correctedAt.desc()),
    // Công bố và Chốt kiểm "Bộ đề này đang chấm lại sau Đính chính".
    index('key_corrections_exam_status_idx').on(t.examId, t.status),
  ],
);

/** Điểm đổi do mỗi Đính chính (Q302): chỉ ghi thêm, để giải thích vì sao điểm đổi và đếm "N người tăng, M người giảm". */
export const keyCorrectionEffects = pgTable(
  'key_correction_effects',
  {
    correctionId: uuid('correction_id')
      .notNull()
      .references(() => keyCorrections.id, { onDelete: 'restrict' }),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    oldScore: numeric('old_score', { precision: 6, scale: 2 }),
    newScore: numeric('new_score', { precision: 6, scale: 2 }),
  },
  (t) => [primaryKey({ columns: [t.correctionId, t.attemptId] })],
);
