import type { Transaction } from '../db/db.module';

/**
 * Cổng "nội dung người dùng đang sở hữu" (Q150): `identity` cần biết người bị Xóa còn Chủ đề nào và chuyển chúng đi,
 * nhưng không đọc bảng của `question-bank` (và ngược lại). `question-bank` cài đặt, nối ở `OwnedContentWiringModule`; đặt ở `common` để `question-bank` không phải import `identity`.
 */
export const OWNED_CONTENT = Symbol('OWNED_CONTENT');

export interface OwnedTopicSummary {
  id: string;
  name: string;
  archived: boolean;
  questionCount: number;
  /** Số Hình minh họa khác nhau mà các Câu hỏi trong Chủ đề dùng. */
  illustrationCount: number;
}

export interface OwnedCounts {
  topics: number;
  questions: number;
  illustrations: number;
}

export interface OwnedContentSummary {
  topics: OwnedTopicSummary[];
  totals: OwnedCounts;
  /** Chỉ có khi hỏi theo `topicIds`: số liệu đúng của các Chủ đề được chọn (ảnh dùng chung chỉ đếm một lần). */
  selected?: OwnedCounts;
}

/**
 * Một lần Chuyển giao đã chuẩn bị xong phần ngoài giao dịch (sao chép file ảnh, Q149). Gọi `apply` trong giao dịch
 * của bên gọi rồi `finish(committed)` sau khi giao dịch kết thúc để dọn file thừa.
 */
export interface PreparedTransfer {
  apply(tx: Transaction, donorName: string): Promise<OwnedCounts>;
  finish(committed: boolean): Promise<void>;
}

export interface OwnedContent {
  summaryOf(userId: string, options?: { topicIds?: string[] }): Promise<OwnedContentSummary>;
  /** `topicIds` là 'all' khi Xóa người dùng (toàn bộ Chủ đề, kể cả đã Lưu trữ). Chủ đề không thuộc `fromId` là lỗi. */
  prepareTransfer(input: {
    fromId: string;
    toId: string;
    topicIds: string[] | 'all';
  }): Promise<PreparedTransfer>;
}
