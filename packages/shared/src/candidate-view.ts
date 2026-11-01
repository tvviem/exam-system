import type { RichText } from './rich-text.js';

// Câu hỏi như Người dự thi được thấy (docs/plan/slice-3.md, Q170). Đối tượng được XÂY MỚI từ danh sách trường cho phép,
// không "xóa trường khóa" khỏi bản gốc, nên trường mới thêm vào payload sau này không vô tình lộ ra.

type Option = { id: string; content: RichText };
type ScoringRule = 'proportional' | 'all_or_nothing' | 'ladder';

/** Hình dạng tối thiểu của Câu hỏi (hoặc bản chụp) mà hàm đọc; phần dư bị bỏ qua. */
export type CandidateSource =
  | {
      type: 'single_choice' | 'multiple_choice';
      stem: RichText;
      payload: {
        options: Option[];
        shuffleOptions: boolean;
        scoringRule?: ScoringRule;
      };
    }
  | {
      type: 'true_false_cluster';
      stem: RichText;
      payload: { statements: Option[]; scoringRule?: ScoringRule; ladder?: number[] };
    }
  | { type: 'essay'; stem: RichText; payload: { maxLength: number } };

export type CandidateView =
  | {
      type: 'single_choice' | 'multiple_choice';
      stem: RichText;
      payload: { options: Option[]; shuffleOptions: boolean; scoringRule?: ScoringRule };
    }
  | {
      type: 'true_false_cluster';
      stem: RichText;
      payload: { statements: Option[]; scoringRule?: ScoringRule; ladder?: number[] };
    }
  | { type: 'essay'; stem: RichText; payload: { maxLength: number } };

const pick = ({ id, content }: Option): Option => ({ id, content });

/**
 * Bỏ Đáp án đúng (`key`) và hướng dẫn chấm (`rubric`) của mọi Loại. `scoringRule`/`ladder` chỉ hiện khi
 * `showScoringRules` (cấu hình ở Phiên thi, mặc định tắt).
 */
export function candidateViewOf(
  question: CandidateSource,
  options: { showScoringRules: boolean },
): CandidateView {
  const { showScoringRules } = options;
  switch (question.type) {
    case 'single_choice':
    case 'multiple_choice': {
      const { payload } = question;
      return {
        type: question.type,
        stem: question.stem,
        payload: {
          options: payload.options.map(pick),
          shuffleOptions: payload.shuffleOptions,
          ...(showScoringRules && payload.scoringRule ? { scoringRule: payload.scoringRule } : {}),
        },
      };
    }
    case 'true_false_cluster': {
      const { payload } = question;
      return {
        type: question.type,
        stem: question.stem,
        payload: {
          statements: payload.statements.map(pick),
          ...(showScoringRules && payload.scoringRule ? { scoringRule: payload.scoringRule } : {}),
          ...(showScoringRules && payload.ladder ? { ladder: [...payload.ladder] } : {}),
        },
      };
    }
    case 'essay':
      return {
        type: question.type,
        stem: question.stem,
        payload: { maxLength: question.payload.maxLength },
      };
  }
}
