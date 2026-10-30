import { z } from 'zod';

// Nội dung có định dạng (Q114): JSON của TipTap theo schema giới hạn. Node hoặc thuộc tính ngoài danh sách đều bị từ chối.
// Node `math` (PR 2b) và `image` (PR 2c) được thêm khi tới PR đó.

const markSchema = z.strictObject({
  type: z.enum(['bold', 'italic', 'underline', 'superscript', 'subscript']),
});

const textNodeSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).max(5).optional(),
});

const hardBreakSchema = z.strictObject({ type: z.literal('hardBreak') });

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(z.discriminatedUnion('type', [textNodeSchema, hardBreakSchema])).optional(),
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
    return [(block.content ?? []).map((node) => (node.type === 'text' ? node.text : ' ')).join('')];
  }
  return block.content.flatMap((item) => item.content.flatMap(blockTexts));
};

/** Văn bản thuần của nội dung: các đoạn và mục cách nhau bằng khoảng trắng. */
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
