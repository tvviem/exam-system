import { z } from 'zod';

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
