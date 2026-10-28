import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { HealthService } from './health.service';

const env = { APP_VERSION: 'test' } as Env;

function service(pg: () => Promise<unknown>, redis: () => Promise<unknown>) {
  return new HealthService(
    { query: pg } as unknown as Pool,
    { ping: redis } as unknown as Redis,
    env,
  );
}

describe('HealthService', () => {
  it('báo ok khi cả hai phụ thuộc đều chạy', async () => {
    const result = await service(
      async () => ({}),
      async () => 'PONG',
    ).check();
    expect(result).toEqual({
      status: 'ok',
      version: 'test',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('báo degraded khi Redis lỗi', async () => {
    const result = await service(
      async () => ({}),
      async () => {
        throw new Error('ECONNREFUSED');
      },
    ).check();
    expect(result.status).toBe('degraded');
    expect(result.checks.redis).toBe('down');
  });
});
