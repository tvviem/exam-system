import {
  hasForbiddenLatex,
  KATEX_OPTIONS,
  mathNodesOf,
  type QuestionInput,
  richTextFieldsOf,
} from '@exam/shared';
import katex from 'katex';
import { ApiError } from '../../common/api-error';

// Kiểm công thức LaTeX khi lưu Câu hỏi (Q121, Q128): phải dựng được bằng KaTeX và không có lệnh nguy hiểm.
// Schema ở @exam/shared chỉ kiểm hình dạng, độ dài và số lượng; KaTeX không đặt trong @exam/shared để gói dùng chung nhẹ.

export type LatexProblem = 'math_invalid' | 'math_forbidden';

export function checkLatex(latex: string): LatexProblem | null {
  if (hasForbiddenLatex(latex)) return 'math_forbidden';
  try {
    katex.renderToString(latex, { ...KATEX_OPTIONS, output: 'html' });
    return null;
  } catch {
    return 'math_invalid';
  }
}

/** Ném `VALIDATION_FAILED` với `path` của từng trường có công thức không hợp lệ. */
export function assertLatexValid(question: QuestionInput): void {
  const issues: { path: string; code: LatexProblem }[] = [];
  for (const { path, doc } of richTextFieldsOf(question)) {
    const problems = mathNodesOf(doc).map((node) => checkLatex(node.latex));
    const code = problems.includes('math_forbidden')
      ? 'math_forbidden'
      : problems.includes('math_invalid')
        ? 'math_invalid'
        : null;
    if (code) issues.push({ path, code });
  }
  if (issues.length > 0) throw new ApiError('VALIDATION_FAILED', { issues });
}
