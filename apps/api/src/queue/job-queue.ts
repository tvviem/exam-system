import { Global, Injectable, Module } from '@nestjs/common';
import { BullMqJobQueue } from './bullmq-job-queue';

export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Tên job và dữ liệu mang theo. Payload chỉ chứa id, không bao giờ chứa dữ liệu bí mật (Q87). */
export interface JobPayloads {
  'account-request.parse': { requestId: string };
  /** `itemIds`: các dòng được duyệt; `rejectedCount`: số dòng bị từ chối cùng đợt, chỉ để ghi nhật ký. */
  'account-request.approve': {
    requestId: string;
    itemIds: string[];
    reviewerId: string;
    reviewerIp: string | null;
    rejectedCount: number;
  };
  /** Xử lý Hình minh họa vừa tải lên: bỏ EXIF, tạo biến thể WebP (Q140). */
  'illustration.process': { illustrationId: string };
  /** Đọc file Nhập Excel Câu hỏi thành các dòng xem trước (Q146). */
  'question-import.parse': { batchId: string };
  /** Tạo Câu hỏi từ các dòng đã chọn của một lô nhập, trong một giao dịch (Q146). */
  'question-import.commit': { batchId: string; actorId: string; actorIp: string | null };
  /** Dọn lô nhập quá 30 ngày và lô kẹt do worker chết (Q146). */
  'question-import.cleanup': Record<string, never>;
  /** Chấm tự động các Lượt vừa nộp (Q286); `attemptIds` tối đa 50 id mỗi job. */
  'grading.autograde': { attemptIds: string[] };
  /** Lưới an toàn: chấm các Lượt đã nộp mà chưa có dấu "đã chấm", mỗi 5 giây (Q286). */
  'grading.sweep': Record<string, never>;
  /** Tự nộp các Lượt làm bài quá hạn, mỗi 10 giây (Q212). */
  'attempt.sweep': Record<string, never>;
  /** Dọn dẹp định kỳ hằng ngày (Q96). */
  'maintenance.cleanup': Record<string, never>;
}
export type JobName = keyof JobPayloads;
export type JobHandler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

/** Nghiệp vụ chỉ biết cổng này; BullMQ là adapter, test dùng bản chạy tại chỗ. */
export interface JobQueue {
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void>;
  /** Đặt job lặp theo lịch cron; gọi lại với cùng tên thì cập nhật lịch, không nhân đôi. */
  schedule<N extends JobName>(name: N, cron: string, payload: JobPayloads[N]): Promise<void>;
}

/** Nơi các module đăng ký hàm xử lý job; worker (hoặc hàng đợi chạy tại chỗ) gọi theo tên. */
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<JobName, JobHandler<JobName>>();
  private readonly crons = new Map<JobName, string>();

  /** `cron`: nếu có, worker đặt lịch chạy job này (payload rỗng) khi khởi động. */
  register<N extends JobName>(
    name: N,
    handler: JobHandler<N>,
    options: { cron?: string } = {},
  ): void {
    this.handlers.set(name, handler as JobHandler<JobName>);
    if (options.cron) this.crons.set(name, options.cron);
  }

  get schedules(): { name: JobName; cron: string }[] {
    return [...this.crons].map(([name, cron]) => ({ name, cron }));
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
