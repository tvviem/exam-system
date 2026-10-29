import { ApiError } from './api-error';

/** Lỗi từ PostgreSQL (driver `pg`), có thể bị Drizzle bọc trong `cause`. */
export interface PgError {
  code: string;
  constraint?: string;
}

const UNIQUE_VIOLATION = '23505';

export function pgErrorOf(error: unknown): PgError | undefined {
  for (let e = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ('code' in e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return e as PgError;
    }
  }
  return undefined;
}

/** Tên ràng buộc UNIQUE bị vi phạm, hoặc undefined nếu không phải lỗi trùng. */
export function uniqueViolationOf(error: unknown): string | undefined {
  const pg = pgErrorOf(error);
  return pg?.code === UNIQUE_VIOLATION ? pg.constraint : undefined;
}

/**
 * Chạy `run`; vi phạm một ràng buộc UNIQUE có trong `fields` (tên ràng buộc → tên trường) thì đổi
 * thành CONFLICT kèm tên trường để giao diện báo đúng ô.
 */
export async function mapUniqueToConflict<T>(
  fields: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const field = fields[uniqueViolationOf(error) ?? ''];
    if (field) throw new ApiError('CONFLICT', { field });
    throw error;
  }
}
