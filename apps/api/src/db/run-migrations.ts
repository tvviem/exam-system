import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = path.resolve(__dirname, '../../drizzle'),
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
