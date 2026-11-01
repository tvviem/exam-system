import type { RichText } from '@exam/shared';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { idColumn, timestamps } from '../../db/columns';
import { users } from '../identity/identity.schema';
import { questions } from '../question-bank/question-bank.schema';

export const examStatusEnum = pgEnum('exam_status', ['draft', 'published', 'archived']);

/**
 * Bộ đề (Q160). Chỉ `draft` sửa được; `version` là khóa lạc quan của lần lưu cả tài liệu (Q163). Phát hành và Lưu trữ
 * làm ở các PR sau nên `published_at`, `archived_at` và `snapshot` chưa có ai ghi.
 */
export const exams = pgTable(
  'exams',
  {
    id: idColumn(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    instructions: jsonb('instructions').$type<RichText>().notNull(),
    status: examStatusEnum('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('exams_owner_updated_idx').on(t.ownerId, t.updatedAt)],
);

/** Phần (Q161): Bộ đề luôn có ít nhất một; `title` NULL là Phần mặc định không tiêu đề. */
export const examSections = pgTable(
  'exam_sections',
  {
    id: idColumn(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    title: text('title'),
    instructions: jsonb('instructions').$type<RichText>().notNull(),
    sort: integer('sort').notNull(),
  },
  (t) => [index('exam_sections_exam_idx').on(t.examId, t.sort)],
);

export const examItems = pgTable(
  'exam_items',
  {
    id: idColumn(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => examSections.id, { onDelete: 'cascade' }),
    // RESTRICT: Câu hỏi nằm trong Bộ đề thì không xóa được (Q166); việc chặn có thông báo rõ làm ở service.
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    points: numeric('points', { precision: 6, scale: 2 }).notNull(),
    sort: integer('sort').notNull(),
    /** Điền khi Phát hành (ADR-0005, Q172); Bộ đề nháp luôn NULL. */
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
  },
  (t) => [
    unique('exam_items_exam_question_unique').on(t.examId, t.questionId),
    index('exam_items_section_idx').on(t.sectionId, t.sort),
  ],
);
