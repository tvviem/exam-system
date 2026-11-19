import { fencesToDelimiters } from './fences';

/**
 * Sửa các lỗi đã gặp ở đầu ra của `mathml2omml` 0.5.0 (đo ở bản thử X0, docs/plan/xuat-bo-de-thiet-ke.md):
 * giá trị `m:sty` là "undefined", thứ tự `m:rPr`/`w:rPr` sai, chữ trần ngoài `m:t` trong toán tử n-ary.
 */

export type Token = { kind: 'open' | 'close' | 'self' | 'text'; name?: string; raw: string };

/** Bộ tách thẻ tối thiểu, đủ cho OMML do thư viện sinh ra (không có CDATA hay chú thích). */
export function tokenize(xml: string): Token[] {
  const tokens: Token[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) tokens.push({ kind: 'text', raw: m[5] });
    else if (m[1]) tokens.push({ kind: 'close', name: m[2], raw: m[0] });
    else if (m[4]) tokens.push({ kind: 'self', name: m[2], raw: m[0] });
    else tokens.push({ kind: 'open', name: m[2], raw: m[0] });
  }
  return tokens;
}

/** Chữ trần trong các hộp OMML (m:e, m:num, m:den, m:sub, m:sup, m:lim) được bọc vào <m:r><m:t>. */
function wrapBareText(omml: string): string {
  const stack: string[] = [];
  return tokenize(omml)
    .map((token) => {
      if (token.kind === 'open') stack.push(token.name as string);
      else if (token.kind === 'close') stack.pop();
      else if (
        token.kind === 'text' &&
        token.raw.trim() !== '' &&
        !['m:t', 'w:t'].includes(stack[stack.length - 1] ?? '')
      ) {
        return `<m:r><m:t xml:space="preserve">${token.raw}</m:t></m:r>`;
      }
      return token.raw;
    })
    .join('');
}

export function repairOmml(omml: string): string {
  const fixed = fencesToDelimiters(omml)
    .replace(/<m:sty m:val="undefined"\/>/g, '')
    .replace(/<w:rPr\/>/g, '')
    // gạch ngang trên: Word dùng m:bar, không dùng m:acc
    .replace(
      /<m:acc><m:accPr><m:chr m:val="[‾¯]"\/><\/m:accPr>([\s\S]*?)<\/m:acc>/g,
      '<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>$1</m:bar>',
    )
    // thứ tự đúng trong m:r: m:rPr rồi w:rPr rồi m:t
    .replace(/<m:r>(<w:rPr>[\s\S]*?<\/w:rPr>)(<m:rPr>[\s\S]*?<\/m:rPr>)/g, '<m:r>$2$1');
  // phông Cambria Math cho mọi lượt chữ, đúng thứ tự m:rPr -> w:rPr -> m:t
  return wrapBareText(fixed).replace(
    /<m:r>(<m:rPr>[\s\S]*?<\/m:rPr>)?(?=<m:t)/g,
    (_all, rpr: string | undefined) =>
      `<m:r>${rpr ?? ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>`,
  );
}
