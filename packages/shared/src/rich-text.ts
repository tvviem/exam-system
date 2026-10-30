import { z } from 'zod';

// Nội dung có định dạng (Q114): JSON của TipTap theo schema giới hạn. Node hoặc thuộc tính ngoài danh sách đều bị từ chối.
// Node `math` (PR 2b) nhúng trong dòng; node `image` (PR 2c) được thêm khi tới PR đó.
// Server còn kiểm LaTeX dựng được bằng KaTeX và chặn lệnh nguy hiểm (apps/api), schema này chỉ kiểm hình dạng.

export const MATH_MAX_CHARS = 2_000;

/**
 * Tùy chọn dựng KaTeX dùng chung cho server (kiểm khi lưu) và web (hiển thị, báo lỗi sớm) để hai bên không lệch nhau.
 * `trust: false` là chốt chặn thật sự với liên kết và ảnh; `strict: 'ignore'` để chữ có dấu trong `\text` không bị từ chối.
 */
export const KATEX_OPTIONS = {
  throwOnError: true,
  trust: false,
  strict: 'ignore',
  maxExpand: 1000,
} as const;

/** `\href`, `\url` (liên kết ra ngoài), `\includegraphics`, `\input`, `\include` và nhóm `\html*` (gắn lớp, kiểu, id). */
const FORBIDDEN_LATEX = /\\(?:href|url|includegraphics|input|include|html[A-Za-z]*)(?![A-Za-z])/;

/** Công thức có lệnh bị cấm (Q121). `\\` là xuống dòng nên chữ theo sau không phải tên lệnh. */
export const hasForbiddenLatex = (latex: string) =>
  FORBIDDEN_LATEX.test(latex.replace(/\\\\/g, ' '));

const markSchema = z.strictObject({
  type: z.enum(['bold', 'italic', 'underline', 'superscript', 'subscript']),
});

const textNodeSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).max(5).optional(),
});

const hardBreakSchema = z.strictObject({ type: z.literal('hardBreak') });

// Công thức LaTeX: `display` false chạy cùng dòng chữ, true hiển thị riêng dòng và căn giữa (Q127).
const mathSchema = z.strictObject({
  type: z.literal('math'),
  attrs: z.strictObject({
    latex: z.string().min(1).max(MATH_MAX_CHARS),
    display: z.boolean(),
  }),
});

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z
    .array(z.discriminatedUnion('type', [textNodeSchema, hardBreakSchema, mathSchema]))
    .optional(),
});

// Mục danh sách chỉ chứa đoạn văn: không lồng danh sách trong danh sách.
const listItemSchema = z.strictObject({
  type: z.literal('listItem'),
  content: z.array(paragraphSchema).min(1),
});

const bulletListSchema = z.strictObject({
  type: z.literal('bulletList'),
  content: z.array(listItemSchema).min(1),
});

const orderedListSchema = z.strictObject({
  type: z.literal('orderedList'),
  attrs: z.strictObject({ start: z.number().int().min(1) }).optional(),
  content: z.array(listItemSchema).min(1),
});

export const richTextSchema = z.strictObject({
  type: z.literal('doc'),
  content: z
    .array(z.discriminatedUnion('type', [paragraphSchema, bulletListSchema, orderedListSchema]))
    .min(1),
});

export type RichText = z.infer<typeof richTextSchema>;

type Block = RichText['content'][number];

const blockTexts = (block: Block): string[] => {
  if (block.type === 'paragraph') {
    return [
      (block.content ?? [])
        .map((node) =>
          node.type === 'text' ? node.text : node.type === 'math' ? node.attrs.latex : ' ',
        )
        .join(''),
    ];
  }
  return block.content.flatMap((item) => item.content.flatMap(blockTexts));
};

const blockMath = (block: Block): { latex: string; display: boolean }[] =>
  block.type === 'paragraph'
    ? (block.content ?? []).flatMap((node) => (node.type === 'math' ? [node.attrs] : []))
    : block.content.flatMap((item) => item.content.flatMap(blockMath));

/** Các công thức trong nội dung, theo thứ tự xuất hiện (kể cả trong danh sách). */
export function mathNodesOf(doc: RichText): { latex: string; display: boolean }[] {
  return doc.content.flatMap(blockMath);
}

/** Số công thức trong nội dung. */
export const countMath = (doc: RichText): number => mathNodesOf(doc).length;

/** Văn bản thuần của nội dung (công thức giữ nguyên LaTeX): các đoạn và mục cách nhau bằng khoảng trắng. */
export function plainTextOf(doc: RichText): string {
  return doc.content.flatMap(blockTexts).join(' ').replace(/\s+/g, ' ').trim();
}

/** Tài liệu một đoạn văn từ chuỗi (rỗng thì đoạn rỗng). */
export function textDoc(value: string): RichText {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        ...(value ? { content: [{ type: 'text' as const, text: value }] } : {}),
      },
    ],
  };
}

/** Chuẩn hóa để tìm không dấu, không phân biệt hoa thường: bỏ dấu, đ thành d, gộp khoảng trắng. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
