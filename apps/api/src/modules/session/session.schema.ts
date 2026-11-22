import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn, timestamps } from '../../db/columns';
import { examItems, examSections, exams } from '../exam/exam.schema';
import { users } from '../identity/identity.schema';

export const attemptScoringEnum = pgEnum('attempt_scoring', ['highest', 'latest']);

/**
 * Cách ra đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md): `shared` là cả Phiên thi dùng chung các Mã đề (bộ câu rút
 * một lần, lưu ở `session_variant_items`); `per_candidate` là mỗi Người dự thi một bộ câu riêng (Rút câu theo Phần của bản 0.3.0).
 */
export const drawScopeEnum = pgEnum('session_draw_scope', ['shared', 'per_candidate']);

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
    /** Hàng có sẵn là `per_candidate` (hành vi cũ); API tạo mới không nêu thì cũng `per_candidate`, giao diện về sau đặt `shared`. */
    drawScope: drawScopeEnum('draw_scope').notNull().default('per_candidate'),
    maxAttempts: integer('max_attempts').notNull().default(1),
    attemptScoring: attemptScoringEnum('attempt_scoring').notNull().default('highest'),
    shuffleItems: boolean('shuffle_items').notNull().default(false),
    shuffleOptions: boolean('shuffle_options').notNull().default(false),
    showScoringRules: boolean('show_scoring_rules').notNull().default(false),
    /** Cho Người dự thi xem lại đề (câu và lựa chọn của chính họ, không đáp án) sau Công bố (Q297). */
    reviewAfterRelease: boolean('review_after_release').notNull().default(false),
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
    /** Mã đề đã chia (chỉ Phiên thi `shared`); trigger bảo đảm cùng Phiên thi. Gỡ Mã đề thì về null. */
    variantId: uuid('variant_id').references(() => sessionVariants.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId] }),
    check('session_roster_extra_check', sql`${t.extraMinutes} BETWEEN 0 AND 600`),
    index('session_roster_user_idx').on(t.userId),
  ],
);

/**
 * Ghi đè tỷ lệ rút của một Phần ở Phiên thi (Q438, docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8). Không có dòng là kế thừa
 * mặc định của Bộ đề (`exam_section_draws`); tỷ lệ hiệu lực tính ở `effectiveDrawPercents` (`@exam/shared`). Trigger
 * `session_section_draws_guard` (migration 0029): Phần phải thuộc Bộ đề của Phiên thi, và Phiên thi đã có Lượt thì không đổi.
 */
export const sessionSectionDraws = pgTable(
  'session_section_draws',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => examSections.id),
    percent: numeric('percent', { precision: 5, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.sectionId] }),
    check('session_section_draws_percent_range', sql`${t.percent} >= 0 AND ${t.percent} <= 100`),
  ],
);

/**
 * Mã đề của Phiên thi `shared` (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.2): 1 đến 10 Mã đề, mỗi Mã đề là một bộ câu rút một
 * lần theo Tỷ lệ rút. `draw_seed` là hạt giống rút lúc tạo (không tính lại: bộ câu nằm ở `session_variant_items`). Trigger
 * (migration 0030): Phiên thi đã có Lượt làm bài thì không thêm, sửa, xóa Mã đề.
 */
export const sessionVariants = pgTable(
  'session_variants',
  {
    id: idColumn(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    number: smallint('number').notNull(),
    label: text('label').notNull(),
    drawSeed: bigint('draw_seed', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('session_variants_session_number_unique').on(t.sessionId, t.number),
    check('session_variants_number_check', sql`${t.number} BETWEEN 1 AND 10`),
    check('session_variants_label_check', sql`char_length(${t.label}) BETWEEN 1 AND 40`),
  ],
);

/** Bộ câu đã rút của một Mã đề: mọi nơi (xem thử, xuất, vào thi) đọc cùng danh sách này. Câu phải thuộc Bộ đề của Phiên thi. */
export const sessionVariantItems = pgTable(
  'session_variant_items',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => sessionVariants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => examItems.id),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.itemId] })],
);
