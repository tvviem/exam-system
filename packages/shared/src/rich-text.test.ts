import { describe, expect, it } from 'vitest';
import { normalizeForSearch, plainTextOf, richTextSchema, textDoc } from './rich-text.js';

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: string[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('richTextSchema', () => {
  it('chấp nhận đoạn văn có định dạng, xuống dòng và danh sách', () => {
    const input = doc(
      para(text('Cho ', ['bold']), text('x', ['italic', 'superscript']), { type: 'hardBreak' }),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [para(text('một'))] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [{ type: 'listItem', content: [para(text('hai', ['underline', 'subscript']))] }],
      },
    );
    expect(richTextSchema.parse(input)).toEqual(input);
  });

  it('chấp nhận đoạn văn rỗng', () => {
    expect(richTextSchema.safeParse(doc({ type: 'paragraph' })).success).toBe(true);
  });

  it.each([
    ['liên kết', para({ ...text('a'), marks: [{ type: 'link', attrs: { href: 'https://x.y' } }] })],
    ['mã nhúng', { type: 'codeBlock', content: [text('x')] }],
    ['bảng', { type: 'table', content: [] }],
    ['hình ngoài danh sách', { type: 'image', attrs: { src: 'http://x/y.png' } }],
    ['node lạ', { type: 'iframe' }],
  ])('từ chối %s', (_name, node) => {
    expect(richTextSchema.safeParse(doc(node)).success).toBe(false);
  });

  it('từ chối thuộc tính lạ trên node và mark', () => {
    expect(
      richTextSchema.safeParse(doc({ ...para(text('a')), attrs: { onclick: 'x()' } })).success,
    ).toBe(false);
    expect(
      richTextSchema.safeParse(
        doc(para({ type: 'text', text: 'a', marks: [{ type: 'bold', attrs: { style: 'x' } }] })),
      ).success,
    ).toBe(false);
  });

  it('từ chối danh sách lồng nhau và văn bản rỗng', () => {
    const nested = doc({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [para(text('a')), { type: 'bulletList', content: [] }],
        },
      ],
    });
    expect(richTextSchema.safeParse(nested).success).toBe(false);
    expect(richTextSchema.safeParse(doc(para({ type: 'text', text: '' }))).success).toBe(false);
  });

  it('từ chối gốc không phải doc', () => {
    expect(richTextSchema.safeParse(para(text('a'))).success).toBe(false);
    expect(richTextSchema.safeParse('<p>a</p>').success).toBe(false);
  });
});

describe('plainTextOf', () => {
  it('nối văn bản các đoạn và mục danh sách, xuống dòng thành khoảng trắng', () => {
    const input = doc(
      para(text('Một '), text('hai', ['bold']), { type: 'hardBreak' }, text('ba')),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [para(text('bốn'))] }],
      },
    );
    expect(plainTextOf(richTextSchema.parse(input))).toBe('Một hai ba bốn');
  });

  it('textDoc dựng tài liệu một đoạn từ chuỗi', () => {
    expect(plainTextOf(textDoc('Xin chào'))).toBe('Xin chào');
    expect(richTextSchema.safeParse(textDoc('Xin chào')).success).toBe(true);
  });
});

describe('normalizeForSearch', () => {
  it('bỏ dấu, đ thành d, chữ thường, gộp khoảng trắng', () => {
    expect(normalizeForSearch('  Đạo   HÀM  của hàm số ')).toBe('dao ham cua ham so');
  });
});
