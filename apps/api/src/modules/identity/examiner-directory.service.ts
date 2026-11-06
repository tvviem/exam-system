import { normalizeForSearch } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { ExaminerDirectory, ExaminerProfile } from '../../common/examiner-directory';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB } from '../../db/db.module';
import { users } from './identity.schema';

const hasExaminerTag = sql`exists (select 1 from user_role_tags where user_role_tags.user_id = users.id and user_role_tags.tag = 'examiner')`;

/** Cài đặt cổng `EXAMINER_DIRECTORY` (Q307). */
@Injectable()
export class ExaminerDirectoryService implements ExaminerDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async profiles(ids: string[]) {
    if (ids.length === 0) return new Map<string, ExaminerProfile>();
    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName, code: users.code })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(rows.map((row) => [row.id, row]));
  }

  async isActiveExaminer(userId: string) {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          isNull(users.removedAt),
          eq(users.status, 'active'),
          hasExaminerTag,
        ),
      );
    return row !== undefined;
  }

  async search(q: string, excludeIds: string[], limit: number) {
    const like = `%${escapeLike(normalizeForSearch(q))}%`;
    return this.db
      .select({ id: users.id, fullName: users.fullName, code: users.code })
      .from(users)
      .where(
        and(
          isNull(users.removedAt),
          eq(users.status, 'active'),
          hasExaminerTag,
          excludeIds.length > 0 ? notInArray(users.id, excludeIds) : undefined,
          q.trim()
            ? sql`(unaccent(lower(${users.fullName})) LIKE ${like} OR lower(${users.code}) LIKE ${like})`
            : undefined,
        ),
      )
      .orderBy(users.fullName)
      .limit(limit);
  }
}
