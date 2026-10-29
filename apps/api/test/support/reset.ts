import { rm } from 'node:fs/promises';
import { Redis } from 'ioredis';
import { Client } from 'pg';

/** Xóa sạch dữ liệu giữa các test: mọi bảng của schema public (trừ bảng migration) và Redis DB test. */
export async function resetState(): Promise<void> {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    const { rows } = await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length > 0) {
      await pg.query(
        `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    }
  } finally {
    await pg.end();
  }
  await rm(process.env.MEDIA_DIR as string, { recursive: true, force: true });
  const redis = new Redis(process.env.REDIS_URL as string);
  await redis.flushdb();
  await redis.quit();
}
