import type { JobName, JobPayloads, JobQueue, JobRegistry } from '../../src/queue/job-queue';

/**
 * Hàng đợi chạy tại chỗ cho test: `enqueue` chỉ xếp job, `drain()` chạy hết. Nhờ vậy test thấy được
 * trạng thái "đang xử lý" và không phải chờ worker thật.
 */
export class InlineJobQueue implements JobQueue {
  private jobs: { name: JobName; payload: JobPayloads[JobName] }[] = [];
  registry?: JobRegistry;
  /** Đặt true để lần `enqueue` kế tiếp ném lỗi (giả lập Redis hỏng). */
  failNextEnqueue = false;

  /** Test gọi job định kỳ trực tiếp qua JobRegistry, nên ở đây không cần lịch. */
  async schedule(): Promise<void> {}

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    if (this.failNextEnqueue) {
      this.failNextEnqueue = false;
      throw new Error('Redis không sẵn sàng');
    }
    this.jobs.push({ name, payload });
  }

  /** Bỏ hết job đang chờ, như thể worker không bao giờ nhận được chúng. */
  discard(): void {
    this.jobs = [];
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
