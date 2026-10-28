// Mặc định trỏ vào pod dev-exam nhưng dùng database `exam_test` và Redis DB 15, tách khỏi dữ liệu demo.
// CI ghi đè bằng TEST_DATABASE_URL và TEST_REDIS_URL.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://exam:exam@127.0.0.1:5434/exam_test';
export const testRedisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6381/15';
