import type { ExamContentData } from './exam-content';

/**
 * Cổng "nội dung Bộ đề với đáp án hiệu lực" (docs/plan/xuat-bo-de-thiet-ke.md mục 4.1): `paper` cần đáp án đã tính Đính chính để
 * ghi tệp Đáp án, nhưng không biết `grading`. `grading` cài đặt, nối ở `AttemptPortsWiringModule`.
 */
export const EFFECTIVE_CONTENT = Symbol('EFFECTIVE_CONTENT');

export interface EffectiveContent {
  /** Nội dung Bộ đề; đáp án của mỗi câu là bản Đính chính mới nhất nếu có. */
  content: ExamContentData;
  /** Các câu (`itemId`) đã được Đính chính đáp án. */
  correctedItemIds: string[];
}

export interface EffectiveContentProvider {
  /** `null` nếu Bộ đề chưa Phát hành hoặc không có. */
  of(examId: string): Promise<EffectiveContent | null>;
}
