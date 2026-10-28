import path from 'node:path';
import { Redis } from 'ioredis';
import { Client } from 'pg';
import { runMigrations } from '../src/db/run-migrations';
import { testDatabaseUrl, testRedisUrl } from './test-env';

// Integration test chạy trên database riêng (tên kết thúc bằng `_test`) và Redis DB riêng,
// cùng pod với dev nhưng không đụng tới dữ liệu demo. Mỗi lần chạy đều làm sạch rồi migrate lại.
export default async function setup() {
  const databaseUrl = testDatabaseUrl;
  const redisUrl = testRedisUrl;

  const dbUrl = new URL(databaseUrl);
  const dbName = dbUrl.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    fail(`Integration test chỉ chạy trên database có tên kết thúc bằng _test, nhận: ${dbName}`);
  }
  const redisDb = Number(new URL(redisUrl).pathname.slice(1) || '0');
  if (redisDb === 0) {
    fail(
      'Integration test không được dùng Redis DB 0 (DB của dev); đặt TEST_REDIS_URL, ví dụ .../15',
    );
  }

  await recreateDatabase(dbUrl, dbName);
  // Vitest nạp file này dưới dạng ESM nên không có __dirname; cwd là apps/api.
  await runMigrations(databaseUrl, path.resolve(process.cwd(), 'drizzle'));

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();
}

async function recreateDatabase(dbUrl: URL, dbName: string) {
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
}

// Vitest 5 in lỗi của globalSetup bị hỏng (TypeError: code.charCodeAt), nên in thông báo trước khi dừng.
function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  throw new Error(message);
}
