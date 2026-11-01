/**
 * Cổng "Câu hỏi và ảnh đang được dùng ở đâu" (Q166, Q174, Q176): `question-bank` cần biết một Câu hỏi hay ảnh có nằm
 * trong Bộ đề không để chặn xóa và cho xem ảnh, nhưng không đọc bảng của `exam`. `exam` cài đặt, nối ở
 * `ExamUsageWiringModule`.
 */
export const EXAM_USAGE = Symbol('EXAM_USAGE');

export interface ExamRef {
  id: string;
  title: string;
}

export interface QuestionUsage {
  /** Bộ đề nháp chứa câu. */
  draftExams: ExamRef[];
  /** Số Bộ đề đã Phát hành hoặc Lưu trữ chứa câu (chỉ Lưu trữ được, không xóa). */
  publishedCount: number;
}

export interface ExamUsage {
  /** Dùng của từng Câu hỏi (mọi câu được hỏi đều có khóa). */
  usageOf(ownerId: string, questionIds: string[]): Promise<Map<string, QuestionUsage>>;
  /** Trong các ảnh được hỏi, những ảnh nằm trong bản chụp của một Bộ đề đã Phát hành. */
  usedIllustrations(illustrationIds: string[]): Promise<Set<string>>;
  /** `userId` có xem được ảnh vì là chủ một Bộ đề đã Phát hành dùng ảnh đó (Q176). */
  canViewIllustration(userId: string, illustrationId: string): Promise<boolean>;
}
