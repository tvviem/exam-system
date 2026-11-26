import { LIST_TOTAL_CAP } from '@exam/shared';

/** Số dòng mỗi trang của các danh sách lớn (mặc định của api, Q67). */
const PAGE_SIZE = 20;
const LAST_PAGE = LIST_TOTAL_CAP / PAGE_SIZE;

/** Tham số `page` trên địa chỉ của danh sách lớn: trang 1 thì bỏ; quá trang cuối cho phép thì về trang cuối đó. */
export function cappedPageParam(value: unknown): number | undefined {
  const page = Number(value);
  return page > 1 ? Math.min(page, LAST_PAGE) : undefined;
}
