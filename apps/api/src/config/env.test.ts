import { describe, expect, it } from 'vitest';
import { loadDatabaseUrl, loadEnv, parseTrustProxy } from './env';

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

  it('migration chỉ cần DATABASE_URL, không đòi các biến khác', () => {
    expect(loadDatabaseUrl({ DATABASE_URL: valid.DATABASE_URL })).toBe(valid.DATABASE_URL);
    expect(() => loadDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });

  it('D-43: khởi động được khi KHÔNG có SLIP_ENCRYPTION_KEY (Phiếu tài khoản đã bị bỏ); khóa còn dư trong api.env bị bỏ qua', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: valid.DATABASE_URL, REDIS_URL: valid.REDIS_URL }),
    ).not.toThrow();
    expect(() => loadEnv({ ...valid, SLIP_ENCRYPTION_KEY: 'khong-con-duoc-dung' })).not.toThrow();
  });
});

describe('DB_POOL_MAX (Q224, Q235)', () => {
  it('mặc định 10 kết nối', () => {
    expect(loadEnv(valid).DB_POOL_MAX).toBe(10);
  });

  it('đọc từ biến môi trường', () => {
    expect(loadEnv({ ...valid, DB_POOL_MAX: '40' }).DB_POOL_MAX).toBe(40);
  });

  it.each(['0', '101', '2.5', 'nhiều'])('từ chối %s', (value) => {
    expect(() => loadEnv({ ...valid, DB_POOL_MAX: value })).toThrow(/DB_POOL_MAX/);
  });
});

describe('TRUST_PROXY (Q224, Q235)', () => {
  it('mặc định tin địa chỉ loopback', () => {
    expect(loadEnv(valid).TRUST_PROXY).toBe('loopback');
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  it('không nhận số bước trung gian', () => {
    expect(() => loadEnv({ ...valid, TRUST_PROXY: '2' })).toThrow(/TRUST_PROXY/);
  });

  it('danh sách cách nhau bằng dấu phẩy là địa chỉ hoặc dải được tin', () => {
    expect(parseTrustProxy(' 10.0.0.0/8 , loopback ')).toEqual(['10.0.0.0/8', 'loopback']);
  });
});
