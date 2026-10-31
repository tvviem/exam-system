import type { RichText } from '@exam/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
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

export const importBatchStatusEnum = pgEnum('question_import_status', [
  'parsing',
  'parse_failed',
  'ready',
  'committing',
  'committed',
]);

export const importItemOutcomeEnum = pgEnum('question_import_outcome', [
  'pending',
  'created',
  'skipped',
]);

/**
 * Lô nhập Câu hỏi từ Excel (Q123, Q146). File tải lên xóa ngay sau khi đọc; `question_import_items.payload` giữ phần
 * đã đổi xong để xem lại và tạo Câu hỏi. Lô sống 30 ngày (`expires_at`), Chủ đề bị xóa thì lô đi theo.
 */
export const questionImportBatches = pgTable(
  'question_import_batches',
  {
    id: idColumn(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    uploadKey: text('upload_key'),
    status: importBatchStatusEnum('status').notNull(),
    parseError: text('parse_error'),
    rowCount: integer('row_count'),
    createdCount: integer('created_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Lúc bấm xác nhận; còn `committing` quá 15 phút thì job dọn đưa lô về `ready`. */
    commitRequestedAt: timestamp('commit_requested_at', { withTimezone: true }),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('question_import_batches_owner_created_idx').on(t.ownerId, t.createdAt)],
);

export const questionImportItems = pgTable(
  'question_import_items',
  {
    id: idColumn(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => questionImportBatches.id, { onDelete: 'cascade' }),
    /** Loại câu hỏi, do sheet của file quyết định (Q156); có cả ở dòng lỗi. */
    type: questionTypeEnum('type').notNull(),
    /** Số dòng trong sheet của nó, không phải trong cả file. */
    rowNumber: integer('row_number').notNull(),
    /** Câu hỏi chưa gắn Chủ đề (`DraftQuestion`); NULL khi dòng lỗi. */
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    searchText: text('search_text'),
    errorCode: text('error_code'),
    /** Nghi trùng: Câu hỏi đã có trong Chủ đề đích, hoặc dòng trước trong cùng file. */
    duplicateOfQuestionId: uuid('duplicate_of_question_id'),
    duplicateOfRow: integer('duplicate_of_row'),
    /** Sheet của dòng trùng; đi cùng `duplicateOfRow` vì số dòng chỉ duy nhất trong một sheet. */
    duplicateOfType: questionTypeEnum('duplicate_of_type'),
    selected: boolean('selected').notNull().default(false),
    outcome: importItemOutcomeEnum('outcome').notNull().default('pending'),
  },
  (t) => [uniqueIndex('question_import_items_batch_row_unique').on(t.batchId, t.type, t.rowNumber)],
);
