import type { RichText } from '@exam/shared';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
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
