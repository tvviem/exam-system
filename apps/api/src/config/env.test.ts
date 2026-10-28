import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://exam:exam@localhost:5434/exam',
  REDIS_URL: 'redis://localhost:6381/0',
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
});
