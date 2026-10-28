import type { HealthResponse } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../db/db.module';
import { REDIS } from '../redis/redis.module';

const CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.all([
      probe(() => this.pool.query('SELECT 1')),
      probe(() => this.redis.ping()),
    ]);
    return {
      status: postgres === 'up' && redis === 'up' ? 'ok' : 'degraded',
      version: this.env.APP_VERSION,
      checks: { postgres, redis },
    };
  }
}

async function probe(run: () => Promise<unknown>): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([run(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
