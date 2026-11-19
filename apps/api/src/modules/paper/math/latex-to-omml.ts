import { KATEX_OPTIONS } from '@exam/shared';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import { markFences, SENTINEL_END, SENTINEL_START } from './fences';
import { repairOmml } from './omml-repair';
import { ommlProblems } from './omml-validate';

export type OmmlResult = { ok: true; omml: string } | { ok: false; reason: string };

/** MathML của KaTeX, bỏ lớp `semantics` và chú thích LaTeX gốc. */
function katexMathml(latex: string, display: boolean): string {
  const html = katex.renderToString(latex, {
    ...KATEX_OPTIONS,
    output: 'mathml',
    displayMode: display,
  });
  const inner = html.match(/<semantics>([\s\S]*?)<annotation/);
  if (!inner?.[1]) throw new Error('không tách được MathML từ KaTeX');
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${inner[1]}</math>`;
}

/** `mathml2omml` báo cáo cảnh báo bằng console.log; gom lại để không in ra nhật ký của máy chủ. */
function runLibrary(mathml: string): { omml: string; messages: string[] } {
  const messages: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => void messages.push(args.join(' '));
  console.warn = console.log;
  try {
    return { omml: mml2omml(mathml), messages };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

const DOUBLE_STRUCK: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };
const isAscii = (text: string) => [...text].every((char) => (char.codePointAt(0) ?? 0) < 128);
const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Căn cột của từng ma trận theo `columnalign` của KaTeX (aligned: phải rồi trái; cases: trái); thư viện ghi cứng căn giữa. */
function applyColumnAlign(omml: string, aligns: (string[] | null)[]): string {
  let index = 0;
  const justification = (value: string) =>
    value === 'left' || value === 'right' ? value : 'center';
  return omml.replace(/<m:mcs>[\s\S]*?<\/m:mcs>/g, (all) => {
    const columns = aligns[index++];
    if (!columns || columns.length === 0) return all;
    return `<m:mcs>${columns
      .map(
        (column) =>
          `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${justification(column)}"/></m:mcPr></m:mc>`,
      )
      .join('')}</m:mcs>`;
  });
}

/** LaTeX (đã qua kiểm khi lưu câu hỏi) thành công thức Word (OMML), hoặc lý do không chuyển được. */
export function latexToOmml(latex: string, display: boolean): OmmlResult {
  try {
    // Chữ Việt trong \text{...}: KaTeX tách dấu thành dấu toán học lồng nhau, nên thay bằng mã giữ chỗ rồi trả lại chữ thật sau.
    const texts: string[] = [];
    const source = latex.replace(
      /\\(text|textrm|mathrm)\{([^{}]*)\}/g,
      (all, _command: string, body: string) => {
        if (isAscii(body)) return all;
        texts.push(body);
        return `\\text{QQTEXT${texts.length - 1}QQ}`;
      },
    );
    let mathml = katexMathml(source, display)
      // chữ kép nét: KaTeX chỉ ghi mathvariant, thư viện làm mất kiểu chữ; đổi thành ký tự Unicode
      .replace(
        /<mi mathvariant="double-struck">([A-Z])<\/mi>/g,
        (_all, letter: string) => `<mi>${DOUBLE_STRUCK[letter] ?? letter}</mi>`,
      )
      // phân số không vạch (\binom): đánh dấu để đổi thành noBar sau khi ghép ngoặc
      .replace(
        /<mfrac linethickness="0px">([\s\S]*?)<\/mfrac>/g,
        `<mrow><mi>${SENTINEL_START}N${SENTINEL_END}</mi><mfrac>$1</mfrac></mrow>`,
      );
    mathml = markFences(mathml);
    const aligns = [...mathml.matchAll(/<mtable([^>]*)>/g)].map((m) => {
      const value = m[1]?.match(/columnalign="([^"]*)"/)?.[1];
      return value ? value.split(/\s+/) : null;
    });
    const { omml } = runLibrary(mathml);
    const repaired = applyColumnAlign(
      repairOmml(omml.replace(/ xmlns:(m|w)="[^"]*"/g, '')),
      aligns,
    );
    const finished = repaired.replace(/QQTEXT(\d+)QQ/g, (_all, i: string) =>
      escapeXml(texts[Number(i)] ?? ''),
    );
    const problems = ommlProblems(finished);
    if (problems.length > 0) return { ok: false, reason: problems.join('; ') };
    return { ok: true, omml: finished };
  } catch (error) {
    return { ok: false, reason: String(error).slice(0, 200) };
  }
}
