import { Client } from 'pg';
import { v7 as uuidv7 } from 'uuid';

/** Tạo sẵn Đơn vị cho phần chuẩn bị của test. */
export async function seedUnit(code: string, name: string): Promise<{ id: string }> {
  const id = uuidv7();
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    await pg.query('INSERT INTO units (id, code, name) VALUES ($1, $2, $3)', [id, code, name]);
  } finally {
    await pg.end();
  }
  return { id };
}
