import { Global, Injectable, Module } from '@nestjs/common';
import { BullMqJobQueue } from './bullmq-job-queue';

export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Tên job và dữ liệu mang theo. Payload chỉ chứa id, không bao giờ chứa dữ liệu bí mật (Q87). */
export interface JobPayloads {
  'account-request.parse': { requestId: string };
}
export type JobName = keyof JobPayloads;
export type JobHandler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

/** Nghiệp vụ chỉ biết cổng này; BullMQ là adapter, test dùng bản chạy tại chỗ. */
export interface JobQueue {
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void>;
}

/** Nơi các module đăng ký hàm xử lý job; worker (hoặc hàng đợi chạy tại chỗ) gọi theo tên. */
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<JobName, JobHandler<JobName>>();

  register<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.set(name, handler as JobHandler<JobName>);
  }

  async run<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Chưa đăng ký hàm xử lý cho job ${name}`);
    await handler(payload);
  }
}

@Global()
@Module({
  providers: [JobRegistry, { provide: JOB_QUEUE, useClass: BullMqJobQueue }],
  exports: [JobRegistry, JOB_QUEUE],
})
export class QueueModule {}
