import type { JobName, JobPayloads, JobQueue, JobRegistry } from '../../src/queue/job-queue';

/**
 * Hàng đợi chạy tại chỗ cho test: `enqueue` chỉ xếp job, `drain()` chạy hết. Nhờ vậy test thấy được
 * trạng thái "đang xử lý" và không phải chờ worker thật.
 */
export class InlineJobQueue implements JobQueue {
  private jobs: { name: JobName; payload: JobPayloads[JobName] }[] = [];
  registry?: JobRegistry;

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    this.jobs.push({ name, payload });
  }

  get pending(): number {
    return this.jobs.length;
  }

  async drain(): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (job) await this.registry?.run(job.name, job.payload);
    }
  }
}
