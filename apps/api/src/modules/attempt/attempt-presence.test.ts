import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { AttemptPresence } from './attempt-presence';

// ADR-0002: mất Redis chỉ mất trạng thái trực tuyến, không được làm hỏng heartbeat hay màn Theo dõi.
const broken = () => {
  const fail = () => Promise.reject(new Error('Redis down'));
  return {
    multi: () => ({ hset: () => ({ pexpire: () => ({ exec: fail }) }) }),
    hgetall: fail,
  } as unknown as Redis;
};

describe('AttemptPresence khi Redis lỗi', () => {
  it('ghi presence không ném lỗi', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const presence = new AttemptPresence(broken());
    await expect(presence.touch('s', 'a', new Date())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('đọc presence trả rỗng thay vì ném lỗi', async () => {
    const presence = new AttemptPresence(broken());
    expect((await presence.lastSeenOf('s')).size).toBe(0);
  });
});
