import { lineBreak, run } from './wordml';

/** Chỗ báo cảnh báo của bản xuất; người gọi gắn thêm số câu. */
export type Warn = (message: string) => void;

interface Mark {
  type: 'bold' | 'italic' | 'underline' | 'superscript' | 'subscript';
}

interface InlineNode {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: { latex?: string; alt?: string };
}

interface BlockNode {
  type: string;
  attrs?: { start?: number; alt?: string };
  content?: BlockNode[] | InlineNode[];
}

const PLACEHOLDER = { color: 'FF0000' } as const;

const inlineRun = (node: InlineNode, warn: Warn): string => {
  if (node.type === 'hardBreak') return lineBreak;
  if (node.type === 'math') {
    warn('công thức chưa hỗ trợ xuất, đã in mã LaTeX');
    return run(`[công thức: ${node.attrs?.latex ?? ''}]`, PLACEHOLDER);
  }
  if (node.type !== 'text') return '';
  const kinds = new Set((node.marks ?? []).map((mark) => mark.type));
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

const inlineRuns = (block: BlockNode, warn: Warn): string =>
  ((block.content ?? []) as InlineNode[]).map((node) => inlineRun(node, warn)).join('');

/**
 * Các đoạn của văn bản có định dạng, mỗi đoạn là một chuỗi các lượt chữ Word.
 * Mục danh sách thành một đoạn có đầu dòng ("• " hoặc "3. ") ghi bằng chữ, để Người ra đề dễ sửa.
 */
export function paragraphRuns(richText: unknown, warn: Warn): string[] {
  const doc = richText as BlockNode;
  const paragraphs: string[] = [];
  for (const block of (doc.content ?? []) as BlockNode[]) {
    if (block.type === 'paragraph') {
      paragraphs.push(inlineRuns(block, warn));
    } else if (block.type === 'bulletList' || block.type === 'orderedList') {
      const start = block.attrs?.start ?? 1;
      ((block.content ?? []) as BlockNode[]).forEach((item, index) => {
        const prefix = block.type === 'bulletList' ? '• ' : `${start + index}. `;
        for (const paragraph of (item.content ?? []) as BlockNode[]) {
          paragraphs.push(run(prefix) + inlineRuns(paragraph, warn));
        }
      });
    } else if (block.type === 'image') {
      warn('hình minh họa chưa hỗ trợ xuất');
      paragraphs.push(run(`[Hình minh họa: ${block.attrs?.alt ?? ''}]`, PLACEHOLDER));
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
