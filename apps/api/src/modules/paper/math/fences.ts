import { type Token, tokenize } from './omml-repair';

/**
 * `mathml2omml` không hỗ trợ ngoặc `\left ... \right` của KaTeX (`mfenced`) và ghi ngoặc thành chữ thường, nên không giãn theo
 * chiều cao. Cách xử lý: đánh dấu ngoặc ở tầng MathML bằng ký tự riêng (vùng ký tự dành riêng, hợp lệ trong XML) rồi, sau khi
 * thư viện sinh OMML, ghép từng cặp từ trong ra ngoài thành đối tượng ngoặc `m:d` của Word.
 */

// Vùng ký tự dành riêng U+E000/U+E001 không gặp trong nội dung toán học thật.
export const SENTINEL_START = '';
export const SENTINEL_END = '';
const S0 = SENTINEL_START;
const S1 = SENTINEL_END;
/** KaTeX ghi thanh đứng là U+2223 (∣) và U+2225 (∥); Word dùng `|` và `‖` cho giá trị tuyệt đối và chuẩn. */
const WORD_FENCE: Record<string, string> = { '\u2223': '|', '\u2225': '‖' };
const fenceChar = (char: string) => WORD_FENCE[char] ?? char;
const SENTINEL = new RegExp(`${S0}[OCN][^${S1}]*${S1}`, 'g');

/** Tách các lượt chữ tại ký tự giữ chỗ (thư viện gộp mtext/mi liền kề vào một m:t); mỗi mã đứng riêng giữa hai lượt chữ. */
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

/** Ghép từng cặp ngoặc (từ trong ra ngoài) thành `m:d`, và đổi phân số đánh dấu N thành không vạch. */
export function fencesToDelimiters(omml: string): string {
  let out = splitRunsAtSentinels(omml).replace(
    new RegExp(`${S0}N${S1}<m:f><m:fPr><m:type m:val="bar"\\/>`, 'g'),
    '<m:f><m:fPr><m:type m:val="noBar"/>',
  );
  const pair = new RegExp(`${S0}O([^${S1}]*)${S1}((?:(?!${S0})[\\s\\S])*?)${S0}C([^${S1}]*)${S1}`);
  for (let guard = 0; guard < 50; guard++) {
    const next = out.replace(
      pair,
      (_all, open: string, body: string, close: string) =>
        `<m:d><m:dPr><m:begChr m:val="${fenceChar(open)}"/><m:endChr m:val="${fenceChar(close)}"/></m:dPr><m:e>${body}</m:e></m:d>`,
    );
    if (next === out) break;
    out = next;
  }
  return out.replace(SENTINEL, '');
}

/**
 * Đánh dấu ngoặc `\left..\right` ở tầng MathML. KaTeX đặt ngoặc mở làm con đầu của `mrow` và ngoặc đóng làm con cuối
 * (`fence="true"`); `\left\{ ... \right.` (như `cases`) KHÔNG có ngoặc đóng nên tự bù một ngoặc đóng rỗng.
 */
export function markFences(mathml: string): string {
  const tokens = tokenize(mathml);
  const out: string[] = [];
  const stack: { fenced: boolean; closed: boolean }[] = [];
  const isFence = (token?: Token) =>
    !!token &&
    (token.kind === 'open' || token.kind === 'self') &&
    /^<mo\b[^>]*fence="true"/.test(token.raw);
  /** Chỉ số thẻ cuối của phần tử `mo` bắt đầu tại i, và ký tự ngoặc. */
  const fenceAt = (i: number) => {
    const token = tokens[i] as Token;
    if (token.kind === 'self') return { end: i, char: '' };
    const body = tokens[i + 1]?.kind === 'text' ? (tokens[i + 1] as Token).raw : '';
    return { end: i + (body ? 2 : 1), char: body };
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as Token;
    if (token.kind === 'open' && token.name === 'mrow') {
      out.push(token.raw);
      if (isFence(tokens[i + 1])) {
        const fence = fenceAt(i + 1);
        out.push(`<mi>${S0}O${fence.char}${S1}</mi>`);
        i = fence.end;
        stack.push({ fenced: true, closed: false });
      } else stack.push({ fenced: false, closed: false });
      continue;
    }
    if (token.kind === 'close' && token.name === 'mrow') {
      const frame = stack.pop();
      if (frame?.fenced && !frame.closed) out.push(`<mi>${S0}C${S1}</mi>`);
      out.push(token.raw);
      continue;
    }
    if (isFence(token)) {
      const fence = fenceAt(i);
      const after = tokens[fence.end + 1];
      const top = stack[stack.length - 1];
      if (top?.fenced && !top.closed && after?.kind === 'close' && after.name === 'mrow') {
        out.push(`<mi>${S0}C${fence.char}${S1}</mi>`);
        top.closed = true;
        i = fence.end;
        continue;
      }
    }
    out.push(token.raw);
  }
  return out.join('');
}
