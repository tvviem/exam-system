/**
 * Cổng "Câu hỏi đang được dùng ở đâu" (Q166, Q174): `question-bank` cần biết một Câu hỏi có nằm trong Bộ đề không để
 * chặn xóa, nhưng không đọc bảng của `exam`. `exam` cài đặt, nối ở `ExamUsageWiringModule`.
 */
export const EXAM_USAGE = Symbol('EXAM_USAGE');

export interface ExamRef {
  id: string;
  title: string;
}

export interface ExamUsage {
  /** Các Bộ đề nháp của `ownerId` đang chứa từng Câu hỏi; câu không có trong Bộ đề nháp nào thì không có khóa. */
  draftExamsOf(ownerId: string, questionIds: string[]): Promise<Map<string, ExamRef[]>>;
}
