import { describe, expect, it } from 'vitest';
import {
  countMath,
  MATH_MAX_CHARS,
  normalizeForSearch,
  plainTextOf,
  richTextSchema,
  textDoc,
} from './rich-text.js';

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

const math = (latex: string, display = false) => ({
  type: 'math',
  attrs: { latex, display },
});

describe('node công thức (math)', () => {
  it('chấp nhận công thức trong dòng và riêng dòng, lẫn với chữ', () => {
    const input = doc(
      para(text('Cho '), math('x^2'), text(' và:')),
      para(math('\\frac{1}{2}', true)),
    );
    expect(richTextSchema.parse(input)).toEqual(input);
  });

  it('chấp nhận công thức trong mục danh sách', () => {
    const input = doc({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [para(math('a+b'))] }],
    });
    expect(richTextSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['thiếu display', { type: 'math', attrs: { latex: 'x' } }],
    ['LaTeX rỗng', math('')],
    [`LaTeX quá ${MATH_MAX_CHARS} ký tự`, math('x'.repeat(MATH_MAX_CHARS + 1))],
    ['thuộc tính lạ', { type: 'math', attrs: { latex: 'x', display: false, color: 'red' } }],
    ['display không phải boolean', { type: 'math', attrs: { latex: 'x', display: 'yes' } }],
    ['có nội dung con', { ...math('x'), content: [text('a')] }],
    ['có mark', { ...math('x'), marks: [{ type: 'bold' }] }],
  ])('từ chối công thức: %s', (_name, node) => {
    expect(richTextSchema.safeParse(doc(para(node))).success).toBe(false);
  });

  it('countMath đếm mọi công thức trong nội dung, kể cả trong danh sách', () => {
    const input = richTextSchema.parse(
      doc(para(math('a'), text('x'), math('b')), {
        type: 'orderedList',
        content: [{ type: 'listItem', content: [para(math('c', true))] }],
      }),
    );
    expect(countMath(input)).toBe(3);
    expect(countMath(textDoc('không có'))).toBe(0);
  });

  it('plainTextOf giữ nguyên LaTeX để tìm kiếm và đếm ký tự', () => {
    const input = richTextSchema.parse(
      doc(para(text('Tính '), math('\\frac{1}{2}'), text(' nhé'))),
    );
    expect(plainTextOf(input)).toBe('Tính \\frac{1}{2} nhé');
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
