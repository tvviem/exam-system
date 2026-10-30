import type { QuestionInput, RichText } from '@exam/shared';
import katex from 'katex';
import { ApiError } from '../../common/api-error';

// Kiểm công thức LaTeX khi lưu Câu hỏi (Q121, Q128): phải dựng được bằng KaTeX và không có lệnh nguy hiểm.
// Schema ở @exam/shared chỉ kiểm hình dạng, độ dài và số lượng; KaTeX chỉ nằm ở server để gói của web gọn.

/** `\href`, `\url` (liên kết ra ngoài), `\includegraphics`, `\input`, `\include` và nhóm `\html*` (gắn lớp, kiểu, id). */
const FORBIDDEN = /\\(?:href|url|includegraphics|input|include|html[A-Za-z]*)(?![A-Za-z])/;

export type LatexProblem = 'math_invalid' | 'math_forbidden';

export function checkLatex(latex: string): LatexProblem | null {
  // `\\` là xuống dòng, chữ theo sau không phải tên lệnh.
  if (FORBIDDEN.test(latex.replace(/\\\\/g, ' '))) return 'math_forbidden';
  try {
    katex.renderToString(latex, {
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxExpand: 1000,
      output: 'html',
    });
    return null;
  } catch {
    return 'math_invalid';
  }
}

const latexOf = (doc: RichText): string[] =>
  doc.content.flatMap((block) =>
    block.type === 'paragraph'
      ? paragraphLatex(block)
      : block.content.flatMap((item) => item.content.flatMap(paragraphLatex)),
  );

const paragraphLatex = (paragraph: Extract<RichText['content'][number], { type: 'paragraph' }>) =>
  (paragraph.content ?? []).flatMap((node) => (node.type === 'math' ? [node.attrs.latex] : []));

/** Ném `VALIDATION_FAILED` với `path` của từng trường có công thức không hợp lệ. */
export function assertLatexValid(question: QuestionInput): void {
  const fields: { path: string; doc: RichText }[] = [{ path: 'stem', doc: question.stem }];
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    for (const [i, option] of question.payload.options.entries()) {
      fields.push({ path: `payload.options.${i}.content`, doc: option.content });
    }
  } else if (question.type === 'true_false_cluster') {
    for (const [i, statement] of question.payload.statements.entries()) {
      fields.push({ path: `payload.statements.${i}.content`, doc: statement.content });
    }
  } else if (question.payload.rubric) {
    fields.push({ path: 'payload.rubric', doc: question.payload.rubric });
  }

  const issues: { path: string; code: LatexProblem }[] = [];
  for (const { path, doc } of fields) {
    const problems = latexOf(doc).map(checkLatex);
    const code = problems.includes('math_forbidden')
      ? 'math_forbidden'
      : problems.includes('math_invalid')
        ? 'math_invalid'
        : null;
    if (code) issues.push({ path, code });
  }
  if (issues.length > 0) throw new ApiError('VALIDATION_FAILED', { issues });
}
