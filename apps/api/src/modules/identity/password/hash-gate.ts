import { availableParallelism } from 'node:os';

/** Hàng đợi đã đầy: không nhận thêm việc. */
export class GateFullError extends Error {
  constructor() {
    super('Hàng đợi băm mật khẩu đã đầy');
  }
}

export interface GateOptions {
  /** Số việc chạy cùng lúc tối đa. */
  concurrency: number;
  /** Số việc chờ tối đa; quá thì từ chối ngay (không để hàng đợi phình vô hạn). */
  maxQueue: number;
}

/**
 * Cổng giới hạn công việc nặng CPU (băm Argon2): tối đa `concurrency` việc chạy cùng lúc, `maxQueue` việc chờ theo thứ tự,
 * quá nữa thì từ chối NGAY. Nhờ vậy một đợt đăng nhập dồn dập không làm cạn luồng của Node (dùng chung với đĩa, DNS) và không
 * kéo chậm bài thi đang diễn ra; kẻ tấn công chỉ nhận lỗi bận, người dùng thật thử lại sau vài giây.
 */
export class WorkGate {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: GateOptions) {}

  run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running < this.options.concurrency) return this.start(job);
    if (this.waiting.length >= this.options.maxQueue) return Promise.reject(new GateFullError());
    return new Promise<T>((resolve, reject) => {
      this.waiting.push(() => {
        this.start(job).then(resolve, reject);
      });
    });
  }

  private async start<T>(job: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      return await job();
    } finally {
      this.running--;
      this.drain();
    }
  }

  private drain(): void {
    while (this.running < this.options.concurrency) {
      const next = this.waiting.shift();
      if (!next) return;
      next();
    }
  }
}

// Mặc định: số luồng của máy nhưng không quá 4 (bằng số luồng nền mặc định của Node); hàng đợi đủ rộng cho 300 sinh viên
// đăng nhập cùng lúc đầu giờ thi (300 x 30 ms / 4 luồng ≈ 2,3 giây).
const defaults = (): GateOptions => ({
  concurrency: Number(process.env.HASH_CONCURRENCY) || Math.min(4, availableParallelism()),
  maxQueue: process.env.HASH_QUEUE_MAX ? Number(process.env.HASH_QUEUE_MAX) : 400,
});

let gate = new WorkGate(defaults());

/** Cổng dùng chung cho mọi lần băm và kiểm tra mật khẩu trong tiến trình. */
export const hashGate = (): WorkGate => gate;

/** Đặt lại cổng (dùng trong kiểm thử và khi cần chỉnh hạn mức); việc đang chạy ở cổng cũ vẫn chạy nốt. */
export function configureHashGate(options: GateOptions): void {
  gate = new WorkGate(options);
}
