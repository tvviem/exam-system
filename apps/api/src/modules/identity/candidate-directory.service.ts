import { normalizeForSearch } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type {
  CandidateDirectory,
  CandidateRecord,
  CandidateSelector,
  CandidateSort,
  Executor,
} from '../../common/candidate-directory';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB } from '../../db/db.module';
import { users } from './identity.schema';

/** Người mang Nhãn Người dự thi (Q200). */
const hasCandidateTag = sql`exists (select 1 from user_role_tags where user_role_tags.user_id = users.id and user_role_tags.tag = 'candidate')`;

/**
 * Thứ tự từ điển tiếng Việt (a ă â b c d đ e ê ... o ô ơ ... u ư ..., thanh điệu: không dấu, huyền, hỏi, ngã, sắc, nặng):
 * collation ICU `vi-x-icu` của PostgreSQL (có sẵn trong image postgres chính thức). Bỏ dấu rồi so sánh sẽ xếp "Đ" lẫn với "D".
 */
const VIETNAMESE = sql.raw('"vi-x-icu"');

/** Cách xếp danh sách lớp ở Việt Nam: theo tên gọi (từ cuối), rồi họ và tên lót, đều theo từ điển. */
const byGivenName = [
  sql`regexp_replace(${users.fullName}, '^.*\\s', '') COLLATE ${VIETNAMESE}`,
  sql`${users.fullName} COLLATE ${VIETNAMESE}`,
  users.id,
];

/** Mã định danh so từng ký tự (collation "C"): mã dài cố định nên 237480201001 < 237480201002, SV01 < SV02; chưa có mã thì cuối. */
const byCode = [sql`lower(${users.code}) COLLATE "C" ASC NULLS LAST`, users.id];

const matches = (like: string) =>
  sql`(unaccent(lower(${users.fullName})) LIKE ${like} OR lower(${users.code}) LIKE ${like})`;

/** Đủ điều kiện dự thi (Q200): chưa Xóa, chưa Khóa, mang Nhãn Người dự thi, không phải chủ Phiên thi. */
const eligibleFor = (excludeUserId: string) =>
  and(
    isNull(users.removedAt),
    eq(users.status, 'active'),
    hasCandidateTag,
    sql`${users.id} <> ${excludeUserId}`,
  );

/** Id không có trong hệ thống: coi như đã Xóa, không phải Người dự thi. */
const unknownPerson = (id: string): CandidateRecord => ({
  id,
  code: null,
  classLabel: null,
  status: 'active',
  removed: true,
  isCandidate: false,
});

/** Cài đặt cổng `CANDIDATE_DIRECTORY` (Q223) cho `session`. */
@Injectable()
export class CandidateDirectoryService implements CandidateDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async page(
    ids: string[],
    options: { q?: string; sort?: CandidateSort; limit: number; offset: number },
  ) {
    if (ids.length === 0) return { total: 0, items: [] };
    const q = options.q ? normalizeForSearch(options.q) : '';
    const where = and(inArray(users.id, ids), q ? matches(`%${escapeLike(q)}%`) : undefined);
    const [[totalRow], items] = await Promise.all([
      this.db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
      this.db
        .select({ id: users.id, code: users.code, fullName: users.fullName })
        .from(users)
        .where(where)
        .orderBy(...(options.sort === 'code' ? byCode : byGivenName))
        .limit(options.limit)
        .offset(options.offset),
    ]);
    return { total: totalRow?.total ?? 0, items };
  }

  async search(
    q: string,
    options: { excludeUserId: string; userLimit: number; classLimit: number },
  ) {
    const like = `%${escapeLike(normalizeForSearch(q))}%`;
    const eligible = eligibleFor(options.excludeUserId);
    const found = await this.db
      .select({
        id: users.id,
        code: users.code,
        fullName: users.fullName,
        classLabel: users.classLabel,
      })
      .from(users)
      .where(and(eligible, matches(like)))
      .orderBy(sql`${users.fullName} COLLATE ${VIETNAMESE}`, users.id)
      .limit(options.userLimit);
    const classes = await this.db
      .select({ label: sql<string>`${users.classLabel}`, count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eligible, sql`unaccent(lower(${users.classLabel})) LIKE ${like}`))
      .groupBy(users.classLabel)
      .orderBy(users.classLabel)
      .limit(options.classLimit);
    return { users: found, classes };
  }

  async resolve(selector: CandidateSelector, executor: Executor = this.db) {
    const columns = {
      id: users.id,
      code: users.code,
      classLabel: users.classLabel,
      status: users.status,
      removedAt: users.removedAt,
      isCandidate: sql<boolean>`${hasCandidateTag}`,
    };
    const find = async (where: SQL | undefined): Promise<CandidateRecord[]> =>
      (await executor.select(columns).from(users).where(where)).map(
        ({ removedAt, status, ...rest }) => ({
          ...rest,
          status: status === 'locked' ? 'locked' : 'active',
          removed: removedAt !== null,
        }),
      );

    if ('userIds' in selector) {
      const people = await find(inArray(users.id, selector.userIds));
      const known = new Set(people.map((p) => p.id));
      const unknown = selector.userIds.filter((id) => !known.has(id));
      return { people: [...people, ...unknown.map(unknownPerson)], notFound: [] };
    }
    if ('classLabel' in selector) {
      const people = await find(
        and(
          isNull(users.removedAt),
          sql`lower(${users.classLabel}) = lower(${selector.classLabel})`,
        ),
      );
      return { people, notFound: [] };
    }
    // Mã không phân biệt hoa thường; mã trùng trong danh sách dán chỉ tính một lần.
    const unique = new Map(selector.codes.map((code) => [code.toLowerCase(), code]));
    const people = await find(
      and(isNull(users.removedAt), inArray(sql`lower(${users.code})`, [...unique.keys()])),
    );
    const matched = new Set(people.map((p) => p.code?.toLowerCase()));
    const notFound = [...unique].filter(([key]) => !matched.has(key)).map(([, code]) => code);
    return { people, notFound };
  }

  async eligibleAmong(ids: string[], excludeUserId: string, executor: Executor = this.db) {
    if (ids.length === 0) return [];
    return executor
      .select({ id: users.id, classLabel: users.classLabel })
      .from(users)
      .where(and(inArray(users.id, ids), eligibleFor(excludeUserId)));
  }
}
