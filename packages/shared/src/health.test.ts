import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('chấp nhận response hợp lệ', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      version: 'abc123',
      checks: { postgres: 'up', redis: 'up' },
    });
    expect(parsed.status).toBe('ok');
  });

  it('từ chối trạng thái phụ thuộc không xác định', () => {
    expect(() =>
      healthResponseSchema.parse({
        status: 'ok',
        version: 'abc123',
        checks: { postgres: 'unknown', redis: 'up' },
      }),
    ).toThrow();
  });
});
