import type { RichText } from '@exam/shared';
import { sql } from 'drizzle-orm';
import {
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
import { idColumn, timestamps } from '../../db/columns';
import { users } from '../identity/identity.schema';

export const questionTypeEnum = pgEnum('question_type', [
  'single_choice',
  'multiple_choice',
  'true_false_cluster',
  'essay',
]);

/** Chủ đề: danh sách phẳng của một Người ra đề. `nameKey` là tên đã bỏ dấu, chữ thường, để kiểm tra trùng. */
export const topics = pgTable(
  'topics',
  {
    id: idColumn(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('topics_owner_name_unique')
      .on(t.ownerId, t.nameKey)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export const questions = pgTable(
  'questions',
  {
    id: idColumn(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    // Lặp lại topics.owner_id để kiểm tra quyền không cần nối bảng.
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    type: questionTypeEnum('type').notNull(),
    stem: jsonb('stem').$type<RichText>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    defaultPoints: numeric('default_points', { precision: 6, scale: 2 }).notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    searchText: text('search_text').notNull(),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('questions_owner_topic_idx').on(t.ownerId, t.topicId, t.updatedAt),
    index('questions_tags_idx').using('gin', t.tags),
  ],
);

export const illustrationStatusEnum = pgEnum('illustration_status', [
  'processing',
  'ready',
  'failed',
]);

/**
 * Hình minh họa của Người ra đề (Q139, Q140). Không giữ bản gốc: chỉ có các biến thể WebP, `variants` là cạnh dài của từng cái.
 * `bytes` là dung lượng đang chiếm: cỡ file tải lên khi còn xử lý, tổng các biến thể khi sẵn sàng, 0 khi lỗi.
 */
export const illustrations = pgTable(
  'illustrations',
  {
    id: idColumn(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    sha256: text('sha256').notNull(),
    status: illustrationStatusEnum('status').notNull(),
    failureReason: text('failure_reason'),
    width: integer('width'),
    height: integer('height'),
    variants: integer('variants').array().notNull().default(sql`'{}'::integer[]`),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('illustrations_owner_sha256_unique').on(t.ownerId, t.sha256),
    index('illustrations_owner_created_idx').on(t.ownerId, t.createdAt),
  ],
);

/** Câu hỏi nào đang dùng ảnh nào; cập nhật mỗi lần lưu Câu hỏi. Có dòng ở đây thì ảnh không xóa được. */
export const questionIllustrations = pgTable(
  'question_illustrations',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    illustrationId: uuid('illustration_id')
      .notNull()
      .references(() => illustrations.id),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.illustrationId] })],
);
