import { type Column, type SQL, sql } from 'drizzle-orm';
import { escapeLike } from './sql-like';

/**
 * Từ khóa có ít nhất ba chữ hoặc số liền nhau thì chỉ mục trigram dùng được. Ngắn hơn mà vẫn để PostgreSQL dùng chỉ mục, nó đọc
 * cả chỉ mục rồi lọc lại, chậm hơn quét bảng nhiều lần (docs/plan/quy-mo-lon-thiet-ke.md mục 4.3).
 */
const hasTrigram = (value: string) => /[\p{L}\p{N}]{3}/u.test(value);

/**
 * Điều kiện "cột tìm kiếm (đã bỏ dấu, chữ thường) chứa từ khóa", không phân biệt hoa thường và dấu. Từ khóa 1–2 ký tự vẫn tìm
 * được nhưng đi đường quét bảng (ghép chuỗi rỗng để PostgreSQL không đụng chỉ mục).
 */
export function searchTextContains(column: Column, q: string): SQL {
  const pattern = sql`lower(unaccent(${`%${escapeLike(q)}%`}))`;
  return hasTrigram(q) ? sql`${column} LIKE ${pattern}` : sql`(${column} || '') LIKE ${pattern}`;
}

/**
 * Lọc trước bằng chỉ mục cho truy vấn đã có điều kiện chính xác riêng trên một phần của cột tìm kiếm. Từ khóa 1–2 ký tự thì không
 * thêm gì: lọc trước khi đó chỉ tốn thêm công trên mỗi dòng.
 */
export const searchTextPrefilter = (column: Column, q: string): SQL | undefined =>
  hasTrigram(q) ? searchTextContains(column, q) : undefined;
