import { describe, expect, it } from 'vitest';
import {
  CODE_MAX_CHARS,
  CODE_MAX_LINES,
  countMath,
  hasForbiddenLatex,
  imageNodesOf,
  MATH_MAX_CHARS,
  mathNodesOf,
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

  it('mathNodesOf trả thuộc tính từng công thức theo thứ tự xuất hiện', () => {
    const input = richTextSchema.parse(
      doc(para(math('a'), math('b', true)), {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [para(math('c'))] }],
      }),
    );
    expect(mathNodesOf(input)).toEqual([
      { latex: 'a', display: false },
      { latex: 'b', display: true },
      { latex: 'c', display: false },
    ]);
  });

  it('plainTextOf giữ nguyên LaTeX để tìm kiếm và đếm ký tự', () => {
    const input = richTextSchema.parse(
      doc(para(text('Tính '), math('\\frac{1}{2}'), text(' nhé'))),
    );
    expect(plainTextOf(input)).toBe('Tính \\frac{1}{2} nhé');
  });
});

describe('hasForbiddenLatex', () => {
  it.each([
    ['\\href{https://x.y}{a}', true],
    ['\\url{x}', true],
    ['\\includegraphics{a}', true],
    ['\\input{a}', true],
    ['\\htmlClass{a}{x}', true],
    ['a + \\href{u}{b}', true],
    ['a \\\\ href', false],
    ['\\frac{1}{2}', false],
    ['\\inputx', false],
  ])('%s → %s', (latex, expected) => {
    expect(hasForbiddenLatex(latex)).toBe(expected);
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

describe('node image (Hình minh họa)', () => {
  const ID = '0b9f2c5e-3f43-4c8e-9a35-5f4f3b0d1a11';
  const image = (
    attrs: Record<string, unknown> = { illustrationId: ID, alt: 'Đồ thị hàm số' },
  ) => ({
    type: 'image',
    attrs,
  });

  it('chấp nhận ảnh đứng riêng giữa các đoạn và lấy lại theo thứ tự', () => {
    const input = doc(para(text('Xem hình')), image(), para(text('Hết')));
    const parsed = richTextSchema.parse(input);
    expect(parsed).toEqual(input);
    expect(imageNodesOf(parsed)).toEqual([{ illustrationId: ID, alt: 'Đồ thị hàm số' }]);
  });

  it.each([
    ['thiếu alt', { illustrationId: ID }],
    ['alt rỗng', { illustrationId: ID, alt: '' }],
    ['alt chỉ có khoảng trắng', { illustrationId: ID, alt: '   ' }],
    ['alt quá 250 ký tự', { illustrationId: ID, alt: 'a'.repeat(251) }],
    ['id không phải uuid', { illustrationId: 'abc', alt: 'x' }],
    ['thuộc tính lạ (src)', { illustrationId: ID, alt: 'x', src: 'http://x/y.png' }],
  ])('từ chối ảnh %s', (_name, attrs) => {
    expect(richTextSchema.safeParse(doc(image(attrs))).success).toBe(false);
  });

  it('nhận alt đúng 250 ký tự', () => {
    expect(
      richTextSchema.safeParse(doc(image({ illustrationId: ID, alt: 'a'.repeat(250) }))).success,
    ).toBe(true);
  });

  it('từ chối ảnh nằm trong mục danh sách hoặc trong đoạn văn', () => {
    expect(
      richTextSchema.safeParse(
        doc({ type: 'bulletList', content: [{ type: 'listItem', content: [image()] }] }),
      ).success,
    ).toBe(false);
    expect(richTextSchema.safeParse(doc(para(image()))).success).toBe(false);
  });

  it('plainTextOf gồm alt để tìm kiếm được', () => {
    expect(plainTextOf(richTextSchema.parse(doc(para(text('Cho')), image())))).toBe(
      'Cho Đồ thị hàm số',
    );
  });
});

// Nội dung Câu hỏi phải giống hệt nhau trên toàn hệ thống dù chữ Việt được gõ hay dán ở dạng dựng sẵn (NFC) hay dấu rời (NFD):
// cùng một chữ thì cùng một chuỗi, cùng số ký tự, cùng cách hiển thị.
describe('richTextSchema chuẩn hóa chữ Việt về NFC', () => {
  const nfd = (value: string) => value.normalize('NFD');
  const NFC_TEXT = 'Nguyễn Việt Hoàng giải phương trình bậc hai';

  it('chữ trong đoạn văn nhập ở dạng dấu rời ra ở dạng dựng sẵn', () => {
    const parsed = richTextSchema.parse(doc(para(text(nfd(NFC_TEXT), ['bold']))));
    expect(plainTextOf(parsed)).toBe(NFC_TEXT);
    expect(plainTextOf(parsed).length).toBe(NFC_TEXT.length);
  });

  it('công thức và mô tả ảnh cũng được chuẩn hóa', () => {
    const parsed = richTextSchema.parse(
      doc(para({ type: 'math', attrs: { latex: nfd('\\text{Việt}'), display: false } }), {
        type: 'image',
        attrs: {
          illustrationId: '0197a6f0-0000-7000-8000-0000000000a1',
          alt: nfd('Đồ thị hàm số'),
        },
      }),
    );
    expect(mathNodesOf(parsed)[0]?.latex).toBe('\\text{Việt}');
    expect(imageNodesOf(parsed)[0]?.alt).toBe('Đồ thị hàm số');
  });

  it('hai dạng của cùng một nội dung cho ra đúng cùng một kết quả', () => {
    const a = richTextSchema.parse(doc(para(text(NFC_TEXT))));
    const b = richTextSchema.parse(doc(para(text(nfd(NFC_TEXT)))));
    expect(b).toEqual(a);
  });
});

describe('mã lệnh: khối mã và mã trong dòng (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.1)', () => {
  const code = (value: string) => ({ type: 'codeBlock', content: [text(value)] });
  const program = 'for (i = 0; i < n; i++)\n    dem++;';

  it('chấp nhận khối mã nhiều dòng và mã trong dòng, giữ nguyên khoảng trắng', () => {
    const input = doc(para(text('Cho '), text('p->Next', ['code'])), code(program));
    expect(richTextSchema.parse(input)).toEqual(input);
  });

  it('xuống dòng kiểu Windows được đưa về một ký tự xuống dòng', () => {
    const parsed = richTextSchema.parse(doc(code('a;\r\n  b;\rc;')));
    expect(parsed).toEqual(doc(code('a;\n  b;\nc;')));
  });

  it.each([
    ['mã trong dòng kèm in đậm', para(text('x', ['code', 'bold']))],
    ['khối mã có chữ định dạng', { type: 'codeBlock', content: [text('x', ['bold'])] }],
    ['khối mã rỗng', { type: 'codeBlock' }],
    ['khối mã hai đoạn chữ', { type: 'codeBlock', content: [text('a'), text('b')] }],
    [
      'khối mã có công thức',
      { type: 'codeBlock', content: [{ type: 'math', attrs: { latex: 'x', display: false } }] },
    ],
    [
      'khối mã có thuộc tính',
      { type: 'codeBlock', attrs: { language: 'c' }, content: [text('x')] },
    ],
    [
      'khối mã trong mục danh sách',
      { type: 'bulletList', content: [{ type: 'listItem', content: [code('x')] }] },
    ],
  ])('từ chối %s', (_name, node) => {
    expect(richTextSchema.safeParse(doc(node)).success).toBe(false);
  });

  it('giới hạn số ký tự (tính cả khoảng trắng) và số dòng của một khối mã', () => {
    const ok = (value: string) => richTextSchema.safeParse(doc(code(value))).success;
    expect(ok(`${' '.repeat(CODE_MAX_CHARS - 1)}x`)).toBe(true);
    expect(ok(`${' '.repeat(CODE_MAX_CHARS)}x`)).toBe(false);
    expect(ok(Array(CODE_MAX_LINES).fill('x').join('\n'))).toBe(true);
    expect(
      ok(
        Array(CODE_MAX_LINES + 1)
          .fill('x')
          .join('\n'),
      ),
    ).toBe(false);
  });

  it('văn bản thuần (tìm kiếm, xem trước, đếm độ dài) gồm cả chữ trong mã; công thức và hình không bị lẫn', () => {
    const parsed = richTextSchema.parse(doc(para(text('Đoạn')), code('if (a)\n  b = 1;')));
    expect(plainTextOf(parsed)).toBe('Đoạn if (a) b = 1;');
    expect(mathNodesOf(parsed)).toEqual([]);
    expect(imageNodesOf(parsed)).toEqual([]);
  });
});
