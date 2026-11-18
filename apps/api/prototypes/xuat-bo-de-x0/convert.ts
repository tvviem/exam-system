// PROTOTYPE BỎ ĐI (PR X0). LaTeX -> KaTeX (MathML) -> OMML, cùng tùy chọn KaTeX với lúc lưu câu hỏi (@exam/shared KATEX_OPTIONS).
// Lớp xử lý trước và sau vì mathml2omml 0.5.0 sinh OMML sai ở nhiều chỗ (xem docs/plan/xuat-bo-de-thiet-ke.md, kết quả X0).

import { ommlToLatex } from 'dwml-ts';
import katex from 'katex';
import { mml2omml } from 'mathml2omml';

const KATEX_OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: 'ignore',
  maxExpand: 1000,
} as const;
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const isAscii = (text: string) => [...text].every((ch) => (ch.codePointAt(0) ?? 0) < 128);
const S0 = '\uE000';
const S1 = '\uE001';

export interface Converted {
  ok: boolean; // chuyển được VÀ qua kiểm cấu trúc
  omml: string;
  ms: number;
  error?: string;
  warnings: string[]; // cảnh báo của thư viện (ví dụ "Type not supported: mpadded") và vấn đề cấu trúc
  roundtrip?: string;
  roundtripSame?: boolean;
  raw?: Pick<Converted, 'ok' | 'warnings'>; // kết quả của đường ống NGUYÊN BẢN (chưa xử lý), để so sánh
}

/** Chuỗi so sánh bỏ các khác biệt cách viết vô hại (khoảng trắng, \left \right, \dfrac, ngoặc nhóm, ký tự áp dụng hàm). */
export function normalize(latex: string): string {
  return latex
    .replace(/\\left|\\right|\\,|\\!|\\;|\\:|\\ |\\quad|\\limits|⁡/g, '')
    .replace(/\\dfrac|\\tfrac/g, '\\frac')
    .replace(/\\mathrm|\\text|\\operatorname|\\mathbb/g, '')
    .replace(/[{}\s]/g, '');
}

// ---------- bộ tách thẻ tối thiểu, đủ để kiểm và sửa OMML ----------
type Tok = { kind: 'open' | 'close' | 'self' | 'text'; name?: string; raw: string };
function tokenize(xml: string): Tok[] {
  const out: Tok[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) out.push({ kind: 'text', raw: m[5] });
    else if (m[1]) out.push({ kind: 'close', name: m[2], raw: m[0] });
    else if (m[4]) out.push({ kind: 'self', name: m[2], raw: m[0] });
    else out.push({ kind: 'open', name: m[2], raw: m[0] });
  }
  return out;
}

/** Vấn đề cấu trúc còn lại sau khi sửa: thẻ không cân, thẻ lạ trong m:t, chữ trần ngoài m:t. */
export function validateOmml(omml: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  for (const t of tokenize(omml)) {
    if (t.kind === 'open') stack.push(t.name as string);
    else if (t.kind === 'close') {
      if (stack.pop() !== t.name) problems.push(`thẻ đóng lệch: ${t.name}`);
    } else if (
      t.kind === 'text' &&
      t.raw.trim() !== '' &&
      !['m:t', 'w:t'].includes(stack[stack.length - 1] ?? '')
    ) {
      problems.push(`chữ trần ngoài m:t: "${t.raw.trim().slice(0, 20)}"`);
    }
    if (t.kind === 'open' || t.kind === 'self') {
      if (stack.includes('m:t') && (t.kind === 'self' || t.name !== 'm:t'))
        problems.push(`thẻ ${t.name} nằm trong m:t`);
      if (/m:val="undefined"/.test(t.raw)) problems.push('giá trị undefined');
    }
  }
  if (omml.includes(S0)) problems.push('còn mã giữ chỗ');
  if (stack.length) problems.push('thẻ chưa đóng');
  return [...new Set(problems)];
}

// ---------- ký tự giữ chỗ: dùng vùng ký tự riêng (hợp lệ trong XML), thư viện gộp các lượt chữ liền kề nên phải tách lại sau ----------
const SENTINEL = new RegExp(`${S0}[OCN][^${S1}]*${S1}`, 'g');

/** Tách các lượt chữ tại ký tự giữ chỗ (mathml2omml gộp mtext/mi liền kề vào một m:t), mỗi mã giữ chỗ đứng riêng giữa hai lượt chữ. */
function splitRunsAtSentinels(omml: string): string {
  return omml.replace(
    new RegExp(
      `<m:r>((?:<m:rPr>(?:(?!<\\/m:rPr>)[\\s\\S])*<\\/m:rPr>)?(?:<w:rPr>(?:(?!<\\/w:rPr>)[\\s\\S])*<\\/w:rPr>)?)<m:t([^>]*)>([^<]*${S0}[^<]*)<\\/m:t><\\/m:r>`,
      'g',
    ),
    (_all, rpr: string, attrs: string, text: string) =>
      text
        .split(new RegExp(`(${S0}[OCN][^${S1}]*${S1})`))
        .filter((piece) => piece !== '')
        .map((piece) =>
          piece.startsWith(S0) ? piece : `<m:r>${rpr}<m:t${attrs}>${piece}</m:t></m:r>`,
        )
        .join(''),
  );
}

/** Ghép từng cặp ngoặc (từ trong ra ngoài) thành đối tượng ngoặc m:d, và đổi phân số đánh dấu N thành không vạch. */
function fencesToDelimiters(omml: string): string {
  let out = splitRunsAtSentinels(omml).replace(
    new RegExp(`${S0}N${S1}<m:f><m:fPr><m:type m:val="bar"\\/>`, 'g'),
    '<m:f><m:fPr><m:type m:val="noBar"/>',
  );
  const pair = new RegExp(`${S0}O([^${S1}]*)${S1}((?:(?!${S0})[\\s\\S])*?)${S0}C([^${S1}]*)${S1}`);
  for (let guard = 0; guard < 50; guard++) {
    const next = out.replace(
      pair,
      (_all, open: string, body: string, close: string) =>
        `<m:d><m:dPr><m:begChr m:val="${open}"/><m:endChr m:val="${close}"/></m:dPr><m:e>${body}</m:e></m:d>`,
    );
    if (next === out) break;
    out = next;
  }
  return out.replace(SENTINEL, '');
}

/**
 * Đánh dấu ngoặc \\left..\\right ở tầng MathML. KaTeX đặt ngoặc mở làm con đầu của mrow và ngoặc đóng làm con cuối (fence="true");
 * \\left\\{ ... \\right. (như cases) KHÔNG có ngoặc đóng nên tự bù một ngoặc đóng rỗng.
 */
function markFences(mathml: string): string {
  const toks = tokenize(mathml);
  const out: string[] = [];
  const stack: { fenced: boolean; closed: boolean }[] = [];
  const isFence = (t?: Tok) =>
    !!t && (t.kind === 'open' || t.kind === 'self') && /^<mo\b[^>]*fence="true"/.test(t.raw);
  /** Chỉ số thẻ cuối của phần tử mo bắt đầu tại i, và ký tự ngoặc. */
  const fenceAt = (i: number) => {
    const t = toks[i] as Tok;
    if (t.kind === 'self') return { end: i, ch: '' };
    const body = toks[i + 1]?.kind === 'text' ? (toks[i + 1] as Tok).raw : '';
    return { end: i + (body ? 2 : 1), ch: body };
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i] as Tok;
    if (t.kind === 'open' && t.name === 'mrow') {
      out.push(t.raw);
      if (isFence(toks[i + 1])) {
        const f = fenceAt(i + 1);
        out.push(`<mi>${S0}O${f.ch}${S1}</mi>`);
        i = f.end;
        stack.push({ fenced: true, closed: false });
      } else stack.push({ fenced: false, closed: false });
      continue;
    }
    if (t.kind === 'close' && t.name === 'mrow') {
      const frame = stack.pop();
      if (frame?.fenced && !frame.closed) out.push(`<mi>${S0}C${S1}</mi>`);
      out.push(t.raw);
      continue;
    }
    if (isFence(t)) {
      const f = fenceAt(i);
      const after = toks[f.end + 1];
      const top = stack[stack.length - 1];
      if (top?.fenced && !top.closed && after?.kind === 'close' && after.name === 'mrow') {
        out.push(`<mi>${S0}C${f.ch}${S1}</mi>`);
        top.closed = true;
        i = f.end;
        continue;
      }
    }
    out.push(t.raw);
  }
  return out.join('');
}

/** Căn cột của từng ma trận theo columnalign của KaTeX (aligned: phải rồi trái; cases: trái); mathml2omml ghi cứng căn giữa. */
function applyColumnAlign(omml: string, aligns: (string[] | null)[]): string {
  let index = 0;
  return omml.replace(/<m:mcs>[\s\S]*?<\/m:mcs>/g, (all) => {
    const cols = aligns[index++];
    if (!cols || cols.length === 0) return all;
    const jc = (v: string) => (v === 'left' || v === 'right' ? v : 'center');
    return `<m:mcs>${cols
      .map((c) => `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${jc(c)}"/></m:mcPr></m:mc>`)
      .join('')}</m:mcs>`;
  });
}

/** Sửa các lỗi đã gặp ở đầu ra của mathml2omml. */
function repairOmml(omml: string): string {
  let out = omml
    .replace(/ xmlns:(m|w)="[^"]*"/g, '')
    .replace(/<m:sty m:val="undefined"\/>/g, '')
    .replace(/<m:rPr><m:nor\/><\/m:rPr>/g, '<m:rPr><m:nor/></m:rPr>')
    // thứ tự đúng trong m:r: m:rPr rồi w:rPr rồi m:t
    .replace(/<w:rPr\/>/g, '')
    .replace(/<m:r>(<w:rPr>[\s\S]*?<\/w:rPr>)(<m:rPr>[\s\S]*?<\/m:rPr>)/g, '<m:r>$2$1')
    // gạch ngang trên: Word dùng m:bar, không dùng m:acc
    .replace(
      /<m:acc><m:accPr><m:chr m:val="[‾¯]"\/><\/m:accPr>([\s\S]*?)<\/m:acc>/g,
      '<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>$1</m:bar>',
    );
  out = fencesToDelimiters(out);
  // chữ trần trong các hộp OMML (m:e, m:num, m:den, m:sub, m:sup, m:lim): bọc vào <m:r><m:t>
  const toks = tokenize(out);
  const stack: string[] = [];
  out = toks
    .map((t) => {
      if (t.kind === 'open') stack.push(t.name as string);
      else if (t.kind === 'close') stack.pop();
      else if (
        t.kind === 'text' &&
        t.raw.trim() !== '' &&
        !['m:t', 'w:t'].includes(stack[stack.length - 1] ?? '')
      ) {
        return `<m:r><m:t xml:space="preserve">${t.raw}</m:t></m:r>`;
      }
      return t.raw;
    })
    .join('');
  // phông Cambria Math cho mọi lượt chữ, đúng thứ tự m:rPr -> w:rPr -> m:t
  return out.replace(
    /<m:r>(<m:rPr>[\s\S]*?<\/m:rPr>)?(?=<m:t)/g,
    (_all, rpr: string | undefined) =>
      `<m:r>${rpr ?? ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>`,
  );
}

const DOUBLE_STRUCK: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };

/** Chạy mml2omml và gom các thông báo nó in ra (nó dùng console.log). */
function runLibrary(mathml: string): { omml: string; warnings: string[] } {
  const warnings: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => void warnings.push(args.join(' '));
  console.warn = console.log;
  try {
    return { omml: mml2omml(mathml), warnings };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

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

/** Đường ống nguyên bản, không xử lý gì (để so sánh trước và sau). */
export function rawPipeline(latex: string, display: boolean): Pick<Converted, 'ok' | 'warnings'> {
  try {
    const { omml, warnings } = runLibrary(katexMathml(latex, display));
    const problems = validateOmml(omml.replace(/ xmlns:(m|w)="[^"]*"/g, ''));
    return {
      ok: problems.length === 0 && warnings.length === 0,
      warnings: [...warnings, ...problems],
    };
  } catch (error) {
    return { ok: false, warnings: [String(error).slice(0, 120)] };
  }
}

export function latexToOmml(latex: string, display: boolean): Converted {
  const started = performance.now();
  const raw = rawPipeline(latex, display);
  try {
    // 1) chữ Việt trong \text{...}: KaTeX tách dấu thành dấu toán học lồng nhau, nên thay bằng mã giữ chỗ rồi trả lại chữ thật sau.
    const texts: string[] = [];
    const source0 = latex.replace(
      /\\(text|textrm|mathrm)\{([^{}]*)\}/g,
      (all, _cmd: string, body: string) => {
        if (isAscii(body)) return all;
        texts.push(body);
        return `\\text{QQTEXT${texts.length - 1}QQ}`;
      },
    );
    // 2) chữ kép nét (\mathbb): KaTeX chỉ ghi mathvariant, mathml2omml làm mất kiểu chữ, nên đổi thành ký tự Unicode ở tầng MathML (xem bước 3)
    const source = source0;
    // 3) phân số không vạch (\binom): đánh dấu để sau này đổi thành m:d + noBar
    let mathml = katexMathml(source, display)
      .replace(
        /<mi mathvariant="double-struck">([A-Z])<\/mi>/g,
        (_all, letter: string) => `<mi>${DOUBLE_STRUCK[letter] ?? letter}</mi>`,
      )
      .replace(
        /<mfrac linethickness="0px">([\s\S]*?)<\/mfrac>/g,
        `<mrow><mi>${S0}N${S1}</mi><mfrac>$1</mfrac></mrow>`,
      );
    mathml = markFences(mathml);
    const aligns = [...mathml.matchAll(/<mtable([^>]*)>/g)].map((m) => {
      const v = m[1]?.match(/columnalign="([^"]*)"/)?.[1];
      return v ? v.split(/\s+/) : null;
    });
    const library = runLibrary(mathml);
    let omml = applyColumnAlign(repairOmml(library.omml), aligns);
    omml = omml.replace(/QQTEXT(\d+)QQ/g, (_all, i: string) =>
      (texts[Number(i)] ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
    const problems = validateOmml(omml);
    const warnings = [...library.warnings, ...problems];
    let roundtrip: string | undefined;
    try {
      roundtrip = ommlToLatex(
        `<m:oMath xmlns:m="${MATH_NS}" xmlns:w="${W_NS}">${omml.replace(/^<m:oMath[^>]*>|<\/m:oMath>$/g, '')}</m:oMath>`,
      );
    } catch (error) {
      warnings.push(`khứ hồi lỗi: ${String(error).slice(0, 60)}`);
    }
    return {
      ok: problems.length === 0,
      omml,
      ms: performance.now() - started,
      warnings,
      roundtrip,
      roundtripSame: roundtrip !== undefined && normalize(roundtrip) === normalize(latex),
      raw,
    };
  } catch (error) {
    return {
      ok: false,
      omml: '',
      ms: performance.now() - started,
      error: String(error).slice(0, 200),
      warnings: [],
      raw,
    };
  }
}
