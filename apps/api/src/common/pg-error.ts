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
