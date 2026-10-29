import { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { BullMqJobQueue } from '../src/queue/bullmq-job-queue';
import { JobRegistry } from '../src/queue/job-queue';
import { JobWorker } from '../src/queue/job-worker';
import { bullmqConnection, JOB_QUEUE_NAME } from '../src/queue/redis-connection';
import { resetState } from './support/reset';

// Adapter BullMQ thật trên Redis test: các test khác dùng hàng đợi chạy tại chỗ.
const env = { REDIS_URL: process.env.REDIS_URL } as Env;

let queue: BullMqJobQueue;
let worker: JobWorker;

beforeEach(resetState);
afterEach(async () => {
  await worker?.onApplicationShutdown();
  await queue?.onApplicationShutdown();
});

async function until(condition: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Hết thời gian chờ job');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('BullMQ job queue', () => {
  it('job xếp ở API được worker lấy và gọi đúng hàm xử lý với payload gốc', async () => {
    const received: string[] = [];
    const registry = new JobRegistry();
    registry.register('account-request.parse', async ({ requestId }) => {
      received.push(requestId);
    });
    queue = new BullMqJobQueue(env);
    worker = new JobWorker(env, registry, queue);
    worker.onApplicationBootstrap();

    await queue.enqueue('account-request.parse', { requestId: 'req-1' });
    await until(() => received.length === 1);
    expect(received).toEqual(['req-1']);
  });

  it('hàm xử lý ném lỗi thì job được ghi nhận lỗi và worker vẫn xử lý job sau', async () => {
    const received: string[] = [];
    const registry = new JobRegistry();
    registry.register('account-request.parse', async ({ requestId }) => {
      if (requestId === 'bad') throw new Error('hỏng');
      received.push(requestId);
    });
    queue = new BullMqJobQueue(env);
    worker = new JobWorker(env, registry, queue);
    worker.onApplicationBootstrap();

    await queue.enqueue('account-request.parse', { requestId: 'bad' });
    await queue.enqueue('account-request.parse', { requestId: 'good' });
    await until(() => received.includes('good'));
    expect(received).toEqual(['good']);
  });

  it('job đăng ký kèm cron được worker đặt lịch lặp trên Redis, gọi lại không nhân đôi', async () => {
    const registry = new JobRegistry();
    registry.register('maintenance.cleanup', async () => {}, { cron: '0 3 * * *' });
    queue = new BullMqJobQueue(env);
    worker = new JobWorker(env, registry, queue);
    worker.onApplicationBootstrap();
    worker.onApplicationBootstrap(); // khởi động lại worker: lịch vẫn chỉ một

    const inspector = new Queue(JOB_QUEUE_NAME, { connection: bullmqConnection(env.REDIS_URL) });
    try {
      await until(() => false, 300).catch(() => {});
      const schedulers = await inspector.getJobSchedulers();
      expect(schedulers.map((s) => [s.key, s.pattern])).toEqual([
        ['maintenance.cleanup', '0 3 * * *'],
      ]);
    } finally {
      await inspector.close();
    }
  });
});
