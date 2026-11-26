import { LIST_TOTAL_CAP } from '@exam/shared';
import { count, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database } from '../db/db.module';

// Q67: mặc định 20, tối đa 100.
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Page = z.infer<typeof pageSchema>;

export interface PageResult<T> extends Page {
  total: number;
  items: T[];
}

/** Đếm tổng và lấy một trang; `items` nhận limit, offset. */
export async function paginate<T>(
  { page, pageSize }: Page,
  total: () => Promise<{ total: number }[]>,
  items: (limit: number, offset: number) => Promise<T[]>,
): Promise<PageResult<T>> {
  const [[totalRow], rows] = await Promise.all([total(), items(pageSize, (page - 1) * pageSize)]);
  return { total: totalRow?.total ?? 0, page, pageSize, items: rows };
}

export interface CappedPageResult<T> extends PageResult<T> {
  /** Còn nhiều kết quả hơn `total`: chỉ đếm tới `LIST_TOTAL_CAP`. */
  totalCapped: boolean;
}

/** Đếm số dòng khớp `where` nhưng dừng ở `limit`: không phải quét hết khi có hàng triệu dòng khớp. */
export const countUpTo = (db: Database, table: PgTable, where: SQL | undefined, limit: number) =>
  db.select({ total: count() }).from(
    db
      .select({ one: sql<number>`1`.as('one') })
      .from(table)
      .where(where)
      .limit(limit)
      .as('capped'),
  );

/**
 * Như `paginate` cho danh sách có thể rất lớn (Q481): đếm tới `LIST_TOTAL_CAP` và không lấy dòng nào sau mức đó. `total` nhận số
 * dòng tối đa cần đếm.
 */
export async function paginateCapped<T>(
  { page, pageSize }: Page,
  total: (limit: number) => Promise<{ total: number }[]>,
  items: (limit: number, offset: number) => Promise<T[]>,
): Promise<CappedPageResult<T>> {
  const offset = (page - 1) * pageSize;
  const take = Math.min(pageSize, LIST_TOTAL_CAP - offset);
  const [[totalRow], rows] = await Promise.all([
    total(LIST_TOTAL_CAP + 1), // thêm một dòng để biết còn nữa hay không
    take > 0 ? items(take, offset) : Promise.resolve([]),
  ]);
  const counted = totalRow?.total ?? 0;
  return {
    total: Math.min(counted, LIST_TOTAL_CAP),
    totalCapped: counted > LIST_TOTAL_CAP,
    page,
    pageSize,
    items: rows,
  };
}
