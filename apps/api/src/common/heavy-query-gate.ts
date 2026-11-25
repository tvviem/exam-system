/**
 * Giới hạn truy vấn danh sách và tìm kiếm có thể chậm (docs/plan/quy-mo-lon-thiet-ke.md mục 6.2, Q482). Một tiến trình api chỉ có
 * 10 kết nối cơ sở dữ liệu dùng chung với đường làm bài; không giới hạn thì vài lượt tìm chậm của một người chiếm hết kết nối và
 * Người dự thi phải đứng chờ. Mỗi trang dùng tối đa 2 kết nối (đếm và lấy dòng).
 */

/** Không nhận được chỗ: hàng đợi đầy, chờ quá hạn, hoặc người gọi đã bỏ cuộc. Việc chưa hề chạy. */
export class GateBusyError extends Error {
  constructor() {
    super('Đang quá nhiều truy vấn danh sách');
  }
}

export interface HeavyQueryGateOptions {
  /** Số việc chạy cùng lúc của mọi người. */
  total: number;
  /** Số việc chờ tối đa của một khóa; quá thì từ chối ngay. */
  maxQueuePerKey: number;
  /** Thời gian chờ chỗ tối đa (ms). */
  waitMs: number;
}

interface Waiter {
  key: string;
  limit: number;
  start: () => void;
}

export class HeavyQueryGate {
  private running = 0;
  private readonly runningByKey = new Map<string, number>();
  private readonly waiting: Waiter[] = [];

  constructor(private readonly options: HeavyQueryGateOptions) {}

  /**
   * Chạy `job` khi còn chỗ: tối đa `perKey` việc cùng lúc cho `key` và `total` việc cho tất cả. Chờ theo thứ tự đến, bỏ qua khóa
   * đang chạm giới hạn riêng để một người dùng nặng không chặn người khác. `signal` hủy việc **đang chờ**.
   */
  run<T>(key: string, perKey: number, job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new GateBusyError());
    // Còn chỗ thì vào ngay: `drain` đã gọi hết người chờ đủ điều kiện, ai còn trong hàng là đang chạm giới hạn riêng của họ.
    if (this.hasRoom(key, perKey)) return this.start(key, job);
    const queued = this.waiting.filter((w) => w.key === key).length;
    if (queued >= this.options.maxQueuePerKey) return Promise.reject(new GateBusyError());
    return new Promise<T>((resolve, reject) => {
      const leave = () => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        cleanUp();
        reject(new GateBusyError());
      };
      const timer = setTimeout(leave, this.options.waitMs);
      const cleanUp = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', leave);
      };
      const waiter: Waiter = {
        key,
        limit: perKey,
        start: () => {
          cleanUp();
          this.start(key, job).then(resolve, reject);
        },
      };
      signal?.addEventListener('abort', leave);
      this.waiting.push(waiter);
    });
  }

  private hasRoom(key: string, limit: number): boolean {
    return this.running < this.options.total && (this.runningByKey.get(key) ?? 0) < limit;
  }

  private async start<T>(key: string, job: () => Promise<T>): Promise<T> {
    this.running++;
    this.runningByKey.set(key, (this.runningByKey.get(key) ?? 0) + 1);
    try {
      return await job();
    } finally {
      this.running--;
      const left = (this.runningByKey.get(key) ?? 1) - 1;
      if (left === 0) this.runningByKey.delete(key);
      else this.runningByKey.set(key, left);
      this.drain();
    }
  }

  private drain(): void {
    while (this.running < this.options.total) {
      const index = this.waiting.findIndex((w) => this.hasRoom(w.key, w.limit));
      if (index < 0) return;
      this.waiting.splice(index, 1)[0]?.start();
    }
  }
}

// Mặc định theo Q482. Tổng 3 trang = tối đa 6 kết nối, chừa ít nhất 4 cho đường làm bài (pool mặc định 10).
const defaults = (): HeavyQueryGateOptions => ({
  total: Number(process.env.HEAVY_QUERY_TOTAL) || 3,
  maxQueuePerKey: 20,
  waitMs: 10_000,
});

let gate = new HeavyQueryGate(defaults());

/** Cổng dùng chung cho mọi truy vấn nặng trong tiến trình. */
export const heavyQueryGate = (): HeavyQueryGate => gate;

/** Đặt lại cổng (kiểm thử); không truyền gì thì về mặc định. Việc đang chạy ở cổng cũ vẫn chạy nốt. */
export function configureHeavyQueryGate(options?: HeavyQueryGateOptions): void {
  gate = new HeavyQueryGate(options ?? defaults());
}
