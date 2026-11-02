import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL } from '../src/db/db.module';
import { createTestApp, type TestApp } from './support/app';

// Q224, Q235: kích thước nhóm kết nối đọc từ DB_POOL_MAX.

let t: TestApp;
beforeAll(async () => {
  process.env.DB_POOL_MAX = '7';
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  delete process.env.DB_POOL_MAX;
});

describe('nhóm kết nối Postgres', () => {
  it('lấy kích thước tối đa từ DB_POOL_MAX', () => {
    const pool = t.app.get<Pool>(PG_POOL);
    expect((pool as unknown as { options: { max: number } }).options.max).toBe(7);
  });
});
