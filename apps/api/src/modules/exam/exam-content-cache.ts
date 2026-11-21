import type { ExamContentData } from '../../common/exam-content';

/** Đóng băng sâu: nội dung dùng chung giữa mọi yêu cầu nên không ai được sửa nó. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Bộ nhớ đệm nội dung Bộ đề đã Phát hành, theo mã Bộ đề. Nội dung này bất biến sau Phát hành (ADR-0005), nên đọc một lần dùng
 * cho mọi Lượt, mọi lần đọc đề và lưu bài (trước đó mỗi yêu cầu đọc lại 3 truy vấn và dựng lại toàn bộ bản chụp). Giới hạn số
 * Bộ đề (bỏ cái lâu không dùng nhất) để bộ nhớ không phình. Không nhớ `null` (Bộ đề nháp sau này có thể được Phát hành) và không
 * nhớ lỗi. Nhiều yêu cầu cùng lúc cho một Bộ đề chưa nhớ dùng chung một lần nạp.
 */
export class ExamContentCache {
  private readonly ready = new Map<string, ExamContentData>();
  private readonly loading = new Map<string, Promise<ExamContentData | null>>();

  constructor(private readonly max: number) {}

  get size() {
    return this.ready.size;
  }

  async getOrLoad(
    examId: string,
    load: () => Promise<ExamContentData | null>,
  ): Promise<ExamContentData | null> {
    const hit = this.ready.get(examId);
    if (hit) {
      // Đưa xuống cuối thứ tự chèn của Map: cuối là mới dùng gần nhất.
      this.ready.delete(examId);
      this.ready.set(examId, hit);
      return hit;
    }
    const pending = this.loading.get(examId);
    if (pending) return pending;
    const loadingNow = load()
      .then((content) => {
        if (content) this.remember(examId, deepFreeze(content));
        return content ? (this.ready.get(examId) ?? content) : null;
      })
      .finally(() => this.loading.delete(examId));
    this.loading.set(examId, loadingNow);
    return loadingNow;
  }

  private remember(examId: string, content: ExamContentData) {
    this.ready.set(examId, content);
    while (this.ready.size > this.max) {
      const oldest = this.ready.keys().next().value as string;
      this.ready.delete(oldest);
    }
  }
}
