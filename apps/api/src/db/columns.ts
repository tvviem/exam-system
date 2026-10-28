import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

/** Khóa chính UUIDv7 sinh ở ứng dụng (PostgreSQL 17 chưa có uuidv7()). */
export const idColumn = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
