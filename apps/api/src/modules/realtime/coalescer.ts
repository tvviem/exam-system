/**
 * Gộp thông báo dồn dập theo khóa: lần đầu chạy ngay (người dùng không phải chờ), các lần kế trong cùng một khoảng được
 * gộp thành đúng một lần ở cuối khoảng. Dùng để 500 Người dự thi gửi nhịp liên tục không biến thành 500 tin mỗi giây
 * xuống màn hình của Người ra đề.
 */
export class Coalescer {
  private readonly last = new Map<string, number>();
  private readonly waiting = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly intervalMs: number,
    private readonly run: (key: string) => void,
    // Đồng hồ đơn điệu: giờ hệ thống có thể nhảy (đồng bộ giờ, WSL2), làm mốc "lần phát trước" nằm ở tương lai.
    private readonly now: () => number = () => performance.now(),
  ) {}

  trigger(key: string): void {
    if (this.waiting.has(key)) return;
    const last = this.last.get(key);
    // Đồng hồ nhảy lùi thì coi như vừa phát (chờ tối đa một khoảng), không giữ tin theo mốc ở tương lai.
    const elapsed = last === undefined ? Number.POSITIVE_INFINITY : Math.max(0, this.now() - last);
    const wait = this.intervalMs - elapsed;
    if (wait <= 0) {
      this.fire(key);
      return;
    }
    this.waiting.set(
      key,
      setTimeout(() => {
        this.waiting.delete(key);
        this.fire(key);
      }, wait),
    );
  }

  dispose(): void {
    for (const timer of this.waiting.values()) clearTimeout(timer);
    this.waiting.clear();
    this.last.clear();
  }

  private fire(key: string) {
    this.last.set(key, this.now());
    this.run(key);
  }
}
