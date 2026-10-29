import { Client } from 'pg';

/** Chạy một câu SQL trực tiếp trên database test, cho phần chuẩn bị và kiểm tra của test. */
export async function sql<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    return (await pg.query(text, params)).rows as T[];
  } finally {
    await pg.end();
  }
}
