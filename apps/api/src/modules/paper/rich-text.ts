import { latexToOmml } from './math/latex-to-omml';
import type { TextSegment } from './option-layout';
import { STYLE } from './styles';
import { lineBreak, run } from './wordml';

/** Chỗ báo cảnh báo của bản xuất; người gọi gắn thêm số câu. */
export type Warn = (message: string) => void;

/** Những thứ văn bản có định dạng cần từ bên ngoài: chỗ báo cảnh báo và nguồn hình. */
export interface RichContext {
  warn: Warn;
  image(illustrationId: string, alt: string): string | undefined;
}

/** Đoạn chứa hình nội tuyến (canh giữa). */
export const isImageRuns = (runs: string): boolean => runs.startsWith('<w:r><w:drawing>');

interface Mark {
  type: 'bold' | 'italic' | 'underline' | 'superscript' | 'subscript' | 'code';
}

interface InlineNode {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { latex?: string; alt?: string; display?: boolean };
}

interface BlockNode {
  type: string;
  attrs?: { start?: number; alt?: string; illustrationId?: string };
  content?: BlockNode[] | InlineNode[];
}

const PLACEHOLDER = { color: 'FF0000' } as const;

/** Word không canh tab trong chữ: mỗi tab thành hai dấu cách, như bề rộng tab trên web. */
const codeChars = (text: string) => text.replace(/\t/g, '  ');

const startsWithStyle = (runs: string, style: string): boolean =>
  runs.startsWith(`<w:r><w:rPr><w:rStyle w:val="${style}"/>`);

/** Đoạn do một dòng của khối mã tạo ra. */
export const isCodeBlock = (runs: string): boolean =>
  startsWithStyle(runs, STYLE.codeText) || startsWithStyle(runs, STYLE.lineNumber);

/** Kiểu đoạn của một đoạn nội dung: dòng mã luôn dùng kiểu của khối mã, đoạn khác dùng kiểu của chỗ đặt. */
export const paragraphStyleOf = (runs: string, fallback?: string): string | undefined => {
  if (startsWithStyle(runs, STYLE.lineNumber)) return STYLE.codeBlockNumbered;
  return startsWithStyle(runs, STYLE.codeText) ? STYLE.codeBlock : fallback;
};

/**
 * Các đoạn của một khối mã, như trên màn hình: từ hai dòng thì mỗi dòng một đoạn mở đầu bằng số thứ tự (canh phải) và
 * một tab; khối một dòng không có số.
 */
const codeBlockParagraphs = (block: BlockNode): string[] => {
  const lines = ((block.content ?? []) as InlineNode[])
    .map((node) => node.text ?? '')
    .join('')
    .split('\n');
  const code = (line: string) => run(codeChars(line), { style: STYLE.codeText });
  if (lines.length === 1) return lines.map(code);
  const width = String(lines.length).length;
  return lines.map(
    (line, index) =>
      run(String(index + 1).padStart(width, ' '), { style: STYLE.lineNumber }) +
      '<w:r><w:tab/></w:r>' +
      code(line),
  );
};

const inlineRun = (node: InlineNode, { warn }: RichContext): string => {
  if (node.type === 'hardBreak') return lineBreak;
  if (node.type === 'math') {
    const latex = node.attrs?.latex ?? '';
    const converted = latexToOmml(latex, false);
    if (converted.ok) return converted.omml;
    warn('công thức chưa hỗ trợ xuất, đã in mã LaTeX');
    return run(`[công thức: ${latex}]`, PLACEHOLDER);
  }
  if (node.type !== 'text') return '';
  const kinds = new Set((node.marks ?? []).map((mark) => mark.type));
  if (kinds.has('code')) return run(codeChars(node.text ?? ''), { style: STYLE.inlineCode });
  return run(node.text ?? '', {
    bold: kinds.has('bold'),
    italic: kinds.has('italic'),
    underline: kinds.has('underline'),
    vertAlign: kinds.has('superscript')
      ? 'superscript'
      : kinds.has('subscript')
        ? 'subscript'
        : undefined,
  });
};

const DISPLAY_MARK = '<m:oMathPara>';

/** Đoạn do công thức riêng dòng tạo ra (không phải đoạn chữ). */
export const isDisplayMath = (runs: string): boolean => runs.startsWith(DISPLAY_MARK);

/**
 * Các đoạn từ một khối đoạn văn: công thức riêng dòng (`display`) đứng một đoạn riêng, chữ trước và sau tách thành đoạn của chúng.
 */
const inlineParagraphs = (block: BlockNode, ctx: RichContext): string[] => {
  const paragraphs: string[] = [];
  let current = '';
  for (const node of (block.content ?? []) as InlineNode[]) {
    if (node.type === 'math' && node.attrs?.display) {
      const converted = latexToOmml(node.attrs.latex ?? '', true);
      if (converted.ok) {
        if (current) paragraphs.push(current);
        current = '';
        paragraphs.push(`${DISPLAY_MARK}${converted.omml}</m:oMathPara>`);
        continue;
      }
    }
    current += inlineRun(node, ctx);
  }
  if (current || paragraphs.length === 0) paragraphs.push(current);
  return paragraphs;
};

const inlineRuns = (block: BlockNode, ctx: RichContext): string =>
  ((block.content ?? []) as InlineNode[]).map((node) => inlineRun(node, ctx)).join('');

/**
 * Các đoạn của văn bản có định dạng, mỗi đoạn là một chuỗi các lượt chữ Word.
 * Mục danh sách thành một đoạn có đầu dòng ("• " hoặc "3. ") ghi bằng chữ, để Người ra đề dễ sửa.
 */
export function paragraphRuns(richText: unknown, ctx: RichContext): string[] {
  const doc = richText as BlockNode;
  const paragraphs: string[] = [];
  const blocks = (doc.content ?? []) as BlockNode[];
  for (const [at, block] of blocks.entries()) {
    if (block.type === 'paragraph') {
      paragraphs.push(...inlineParagraphs(block, ctx));
    } else if (block.type === 'codeBlock') {
      // Đoạn trống ngăn hai khối liền nhau, nếu không Word gom thành một khung.
      if (blocks[at - 1]?.type === 'codeBlock') paragraphs.push('');
      paragraphs.push(...codeBlockParagraphs(block));
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
      const start = block.attrs?.start ?? 1;
      ((block.content ?? []) as BlockNode[]).forEach((item, index) => {
        const prefix = block.type === 'bulletList' ? '• ' : `${start + index}. `;
        for (const paragraph of (item.content ?? []) as BlockNode[]) {
          paragraphs.push(run(prefix) + inlineRuns(paragraph, ctx));
        }
      });
    } else if (block.type === 'image') {
      const id = block.attrs?.illustrationId ?? '';
      const alt = block.attrs?.alt ?? '';
      const drawing = ctx.image(id, alt);
      if (drawing) {
        paragraphs.push(drawing);
      } else {
        ctx.warn('hình minh họa không có dữ liệu để xuất, đã in chỗ giữ');
        paragraphs.push(run(`[Hình minh họa: ${alt}]`, PLACEHOLDER));
      }
    }
  }
  return paragraphs;
}

/** Chữ thuần của văn bản có định dạng (để đo độ rộng), các đoạn nối bằng một dấu cách. */
export function plainText(richText: unknown): string {
  const doc = richText as BlockNode;
  return ((doc.content ?? []) as BlockNode[])
    .map((block) =>
      ((block.content ?? []) as InlineNode[])
        .map((node) => (node.type === 'text' ? (node.text ?? '') : ''))
        .join(''),
    )
    .join(' ');
}

/** Các mẩu chữ theo thứ tự, đánh dấu mẩu in bằng phông đơn cách (để đo độ rộng Phương án). */
export function textSegments(richText: unknown): TextSegment[] {
  const doc = richText as BlockNode;
  return ((doc.content ?? []) as BlockNode[]).flatMap((block, index) => [
    ...(index > 0 ? [{ text: ' ' }] : []),
    ...((block.content ?? []) as InlineNode[]).flatMap((node) =>
      node.type === 'text'
        ? [{ text: node.text ?? '', code: node.marks?.some((mark) => mark.type === 'code') }]
        : [],
    ),
  ]);
}
