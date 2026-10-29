import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { type JobName, type JobPayloads, JobRegistry } from './job-queue';
import { bullmqConnection, JOB_QUEUE_NAME } from './redis-connection';

/** Lấy job từ hàng đợi BullMQ và gọi hàm xử lý đã đăng ký. Chỉ chạy trong tiến trình worker. */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly registry: JobRegistry,
  ) {}

  onApplicationBootstrap() {
    this.worker = new Worker(
      JOB_QUEUE_NAME,
      (job) => this.registry.run(job.name as JobName, job.data as JobPayloads[JobName]),
      { connection: bullmqConnection(this.env.REDIS_URL), concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.name} (${job?.id}) lỗi: ${error.message}`);
    });
  }

  async onApplicationShutdown() {
    await this.worker?.close();
  }
}
