// Chuẩn bị api cho E2E: tạo lại database exam_e2e, migrate, tạo sẵn Người dùng, rồi chạy api ở cổng 3100.
// Dùng database và Redis DB riêng nên không đụng dữ liệu demo của dev.
const path = require('node:path');
const { createRequire } = require('node:module');

const apiDir = path.resolve(__dirname, '../../api');
const apiRequire = createRequire(path.join(apiDir, 'package.json'));
const { Client } = apiRequire('pg');
const { Redis } = apiRequire('ioredis');
const { runMigrations } = require(path.join(apiDir, 'dist/db/run-migrations.js'));
const { hashPassword } = require(path.join(apiDir, 'dist/modules/identity/password/password-hasher.js'));

const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_e2e';
const redisUrl = process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:6381/14';

const users = require('./users.json');

async function main() {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_e2e')) throw new Error(`E2E chỉ chạy trên database có hậu tố _e2e, nhận: ${dbName}`);
  if (new URL(redisUrl).pathname.slice(1) === '0') throw new Error('E2E không được dùng Redis DB 0');

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  await runMigrations(databaseUrl, path.join(apiDir, 'drizzle'));

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  for (const user of users) {
    const { rows } = await db.query(
      `INSERT INTO users (id, username, full_name, password_hash, is_admin, must_change_password)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id`,
      [
        user.username,
        user.fullName,
        await hashPassword(user.password),
        user.isAdmin,
        user.mustChangePassword ?? true,
      ],
    );
    for (const tag of user.roleTags ?? []) {
      await db.query('INSERT INTO user_role_tags (user_id, tag) VALUES ($1, $2)', [rows[0].id, tag]);
    }
  }
  await db.end();

  const redis = new Redis(redisUrl);
  await redis.flushdb();
  await redis.quit();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '3100',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    APP_ORIGINS: 'http://localhost:4173',
    MEDIA_DIR: path.join(require('node:os').tmpdir(), 'exam-e2e-media'),
  });
  require(path.join(apiDir, 'dist/main.js'));
  // Production chạy worker thành tiến trình riêng; E2E chạy chung để các job (đọc file Excel...) được xử lý.
  require(path.join(apiDir, 'dist/worker/main.js'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
