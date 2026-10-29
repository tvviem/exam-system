import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { idColumn } from '../../db/columns';
import { users } from '../identity/identity.schema';

/** Thông báo trong ứng dụng (chuông). `type` và `data` do bên gửi quy định, giao diện dịch theo `type`. */
export const notifications = pgTable(
  'notifications',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);
