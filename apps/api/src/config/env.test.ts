import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://exam:exam@localhost:5434/exam',
  REDIS_URL: 'redis://localhost:6381/0',
  SLIP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('loadEnv', () => {
  it('điền giá trị mặc định', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.APP_VERSION).toBe('dev');
  });

  it('báo lỗi khi thiếu DATABASE_URL', () => {
    expect(() => loadEnv({ REDIS_URL: valid.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('báo lỗi khi khóa mã hóa phiếu không đủ 32 byte', () => {
    const short = Buffer.alloc(16).toString('base64');
    expect(() => loadEnv({ ...valid, SLIP_ENCRYPTION_KEY: short })).toThrow(/SLIP_ENCRYPTION_KEY/);
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL, REDIS_URL: valid.REDIS_URL })).toThrow(
      /SLIP_ENCRYPTION_KEY/,
    );
  });
});
