import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { JobName, JobPayloads, JobQueue } from './job-queue';
import { bullmqConnection, JOB_QUEUE_NAME } from './redis-connection';

const DAY_SECONDS = 24 * 60 * 60;

@Injectable()
export class BullMqJobQueue implements JobQueue, OnApplicationShutdown {
  private queue?: Queue;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    this.queue ??= new Queue(JOB_QUEUE_NAME, { connection: bullmqConnection(this.env.REDIS_URL) });
    await this.queue.add(name, payload, {
      attempts: 1, // job phân tích tự bắt lỗi và ghi trạng thái; chạy lại vô ích
      removeOnComplete: { age: DAY_SECONDS },
      removeOnFail: { age: 7 * DAY_SECONDS },
    });
  }

  async onApplicationShutdown() {
    await this.queue?.close();
  }
}
