import { MATH_MAX_PER_QUESTION, type RichText, textDoc } from '@exam/shared';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_ROWS,
  parseQuestionImportFile,
  QuestionImportFileError,
} from './question-import-file';

const HEADER = [
  'Nội dung',
  'Phương án A',
  'Phương án B',
  'Phương án C',
  'Phương án D',
  'Phương án E',
  'Phương án F',
  'Đáp án',
  'Điểm',
  'Quy tắc chấm',
  'Tags',
];

/** Một dòng CSV: mọi ô được đặt trong ngoặc kép để dấu phẩy và xuống dòng trong ô không vỡ cột. */
const csvLine = (cells: string[]) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(',');

interface RowOver {
  options?: readonly string[];
  'Nội dung'?: string;
  'Đáp án'?: string;
  Điểm?: string;
  'Quy tắc chấm'?: string;
  Tags?: string;
}

/** Dòng dữ liệu theo thứ tự cột của mẫu; ô không nêu thì để trống. */
function row(over: RowOver) {
  const options = over.options ?? ['x', '2x', 'x²'];
  return HEADER.map((title, i) => {
    if (i >= 1 && i <= 6) return options[i - 1] ?? '';
    if (title === 'Nội dung') return over['Nội dung'] ?? 'Đạo hàm của x² là gì?';
    if (title === 'Đáp án') return over['Đáp án'] ?? 'B';
    return over[title as keyof RowOver] ?? '';
  }) as string[];
}

const file = (...rows: string[][]) =>
  Buffer.from([csvLine(HEADER), ...rows.map(csvLine)].join('\n'), 'utf8');

async function parseOne(over: RowOver) {
  const { rows } = await parseQuestionImportFile(file(row(over)));
  const [only] = rows;
  if (!only) throw new Error('không có dòng nào');
  return only;
}

describe('đọc dòng hợp lệ', () => {
  it('dòng có một đáp án là Câu chọn một, mã Phương án o1, o2... theo thứ tự cột', async () => {
    const parsed = await parseOne({ Tags: 'Đạo hàm, Lớp 12' });
    expect(parsed.error).toBeNull();
    expect(parsed.input).toEqual({
      type: 'single_choice',
      stem: textDoc('Đạo hàm của x² là gì?'),
      defaultPoints: 1,
      tags: ['đạo hàm', 'lớp 12'],
      payload: {
        options: [
          { id: 'o1', content: textDoc('x') },
          { id: 'o2', content: textDoc('2x') },
          { id: 'o3', content: textDoc('x²') },
        ],
        key: ['o2'],
        shuffleOptions: true,
      },
    });
  });

  it('từ hai đáp án trở lên là Câu chọn nhiều; Quy tắc chấm trống thì lấy Tỷ lệ', async () => {
    const parsed = await parseOne({ 'Đáp án': 'A, C' });
    expect(parsed.input).toMatchObject({
      type: 'multiple_choice',
      payload: { key: ['o1', 'o3'], scoringRule: 'proportional' },
    });
  });

  it.each([
    ['Tỷ lệ', 'proportional'],
    ['tỷ lệ', 'proportional'],
    ['Đúng hết', 'all_or_nothing'],
    ['dung het', 'all_or_nothing'],
  ])('Quy tắc chấm "%s" → %s', async (text, rule) => {
    const parsed = await parseOne({ 'Đáp án': 'A;B', 'Quy tắc chấm': text });
    expect(parsed.input).toMatchObject({ payload: { scoringRule: rule } });
  });

  it('chữ đáp án không phân biệt hoa thường; dùng được sáu Phương án', async () => {
    const parsed = await parseOne({ options: ['a', 'b', 'c', 'd', 'e', 'f'], 'Đáp án': 'f' });
    expect(parsed.input).toMatchObject({ payload: { key: ['o6'] } });
  });

  it.each([
    ['', 1],
    ['2', 2],
    ['0,5', 0.5],
    ['0.25', 0.25],
    ['100', 100],
  ])('điểm "%s" → %s', async (text, points) => {
    const parsed = await parseOne({ Điểm: text });
    expect(parsed.error).toBeNull();
    expect(parsed.input?.defaultPoints).toBe(points);
  });

  it('tiêu đề cột khớp không phân biệt hoa thường và dấu; cột lạ bị bỏ qua; số dòng là số thật trong file', async () => {
    const header = ['STT', 'NOI DUNG', 'phuong an a', 'Phương án  B', 'DAP AN'];
    const text = [
      csvLine(header),
      csvLine(['1', 'Câu một', 'a', 'b', 'A']),
      csvLine(['', '', '', '', '']),
      csvLine(['3', 'Câu ba', 'a', 'b', 'B']),
    ].join('\n');
    const { rows } = await parseQuestionImportFile(Buffer.from(text, 'utf8'));
    expect(rows.map((r) => [r.rowNumber, r.error])).toEqual([
      [2, null],
      [4, null],
    ]);
  });

  it('đọc được file xlsx, kể cả ô điểm là số', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Câu hỏi');
    sheet.addRow(HEADER);
    sheet.addRow(['Hai cộng hai?', '3', '4', '', '', '', '', 'B', 0.5, '', '']);
    const content = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows } = await parseQuestionImportFile(content);
    expect(rows[0]?.input).toMatchObject({ defaultPoints: 0.5, payload: { key: ['o2'] } });
  });
});

describe('công thức và xuống dòng trong ô (Q145)', () => {
  const inline = (parsed: Awaited<ReturnType<typeof parseOne>>) =>
    parsed.input?.stem.content[0] && 'content' in parsed.input.stem.content[0]
      ? parsed.input.stem.content[0].content
      : undefined;

  it('$...$ thành công thức trong dòng, chữ xung quanh giữ nguyên', async () => {
    const parsed = await parseOne({ 'Nội dung': 'Tính $x^2$ nhé' });
    expect(parsed.error).toBeNull();
    expect(inline(parsed)).toEqual([
      { type: 'text', text: 'Tính ' },
      { type: 'math', attrs: { latex: 'x^2', display: false } },
      { type: 'text', text: ' nhé' },
    ]);
  });

  it('công thức cũng dùng được trong Phương án', async () => {
    const parsed = await parseOne({ options: ['$\\frac{1}{2}$', '1', '2'] });
    expect(parsed.error).toBeNull();
    const payload = parsed.input?.payload as { options: { content: RichText }[] } | undefined;
    const first = payload?.options[0];
    expect(first?.content.content[0]).toMatchObject({
      content: [{ type: 'math', attrs: { latex: '\\frac{1}{2}', display: false } }],
    });
  });

  it.each([
    ['Giá \\$5 và \\$6', 'Giá $5 và $6'],
    ['Có $ một dấu', 'Có $ một dấu'],
    ['Rỗng $$ nhé', 'Rỗng $$ nhé'],
    ['Không hỗ trợ $$x^2$$ nhé', 'Không hỗ trợ $$x^2$$ nhé'],
  ])('\\$, $ lẻ và $$ rỗng là chữ: "%s"', async (cell, expected) => {
    expect(inline(await parseOne({ 'Nội dung': cell }))).toEqual([
      { type: 'text', text: expected },
    ]);
  });

  it('xuống dòng trong ô thành hardBreak', async () => {
    const parsed = await parseOne({ 'Nội dung': 'Dòng một\nDòng hai' });
    expect(inline(parsed)).toEqual([
      { type: 'text', text: 'Dòng một' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Dòng hai' },
    ]);
  });

  it('LaTeX không dựng được hoặc có lệnh cấm là lỗi của dòng', async () => {
    expect((await parseOne({ 'Nội dung': 'Sai $\\frac{1$' })).error).toBe('math_invalid');
    expect((await parseOne({ 'Nội dung': 'Cấm $\\href{http://x}{y}$' })).error).toBe(
      'math_forbidden',
    );
  });

  it('quá số công thức cho phép trong một Câu hỏi là lỗi', async () => {
    const many = Array.from({ length: MATH_MAX_PER_QUESTION + 1 }, (_, i) => `$a${i}$`).join(' ');
    expect((await parseOne({ 'Nội dung': many })).error).toBe('too_many_formulas');
  });
});

describe('lỗi từng dòng (Q123, Q145)', () => {
  it.each([
    ['thiếu nội dung', { 'Nội dung': '  ' }, 'missing_content'],
    ['ít hơn 2 Phương án', { options: ['chỉ một'], 'Đáp án': 'A' }, 'too_few_options'],
    ['Phương án trống ở giữa', { options: ['a', '', 'c'], 'Đáp án': 'A' }, 'gap_in_options'],
    ['đáp án trống', { 'Đáp án': '' }, 'answer_mismatch'],
    ['đáp án trỏ Phương án không có', { options: ['a', 'b'], 'Đáp án': 'C' }, 'answer_mismatch'],
    ['đáp án không phải chữ cái', { 'Đáp án': '2' }, 'answer_mismatch'],
    ['đáp án lặp', { 'Đáp án': 'A,A' }, 'answer_mismatch'],
    ['điểm không phải số', { Điểm: 'mười' }, 'invalid_points'],
    ['điểm dạng thập lục phân', { Điểm: '0x10' }, 'invalid_points'],
    ['điểm dạng khoa học', { Điểm: '1e1' }, 'invalid_points'],
    ['điểm không chia hết 0,25', { Điểm: '0,3' }, 'invalid_points'],
    ['điểm dưới 0,25', { Điểm: '0' }, 'invalid_points'],
    ['điểm trên 100', { Điểm: '101' }, 'invalid_points'],
    ['Quy tắc chấm ở câu chọn một', { 'Quy tắc chấm': 'Tỷ lệ' }, 'scoring_rule_not_allowed'],
    [
      'Quy tắc chấm không hiểu',
      { 'Đáp án': 'A,B', 'Quy tắc chấm': 'Bậc thang' },
      'invalid_scoring_rule',
    ],
    ['Phương án quá 2.000 ký tự', { options: ['x'.repeat(2001), 'b'] }, 'field_too_long'],
    ['Nội dung quá 20.000 ký tự', { 'Nội dung': 'x'.repeat(20_001) }, 'field_too_long'],
    [
      'quá 10 tag',
      { Tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') },
      'too_many_tags',
    ],
    ['tag quá 30 ký tự', { Tags: 'x'.repeat(31) }, 'field_too_long'],
  ] as const)('%s → %s', async (_name, over, code) => {
    const parsed = await parseOne(over);
    expect(parsed.error).toBe(code);
    expect(parsed.input).toBeNull();
  });

  it('một dòng lỗi không làm hỏng dòng khác', async () => {
    const { rows } = await parseQuestionImportFile(
      file(row({}), row({ 'Đáp án': '' }), row({ 'Đáp án': 'A,C' })),
    );
    expect(rows.map((r) => r.error)).toEqual([null, 'answer_mismatch', null]);
  });
});

describe('lỗi của cả file', () => {
  const fails = async (content: Buffer, code: string) => {
    const error = await parseQuestionImportFile(content).catch((e) => e);
    expect(error).toBeInstanceOf(QuestionImportFileError);
    expect((error as QuestionImportFileError).code).toBe(code);
  };

  it('thiếu cột bắt buộc', async () => {
    await fails(Buffer.from('Nội dung,Phương án A\nx,y', 'utf8'), 'missing_columns');
  });

  it('file không có dòng dữ liệu', async () => {
    await fails(file(), 'empty_file');
  });

  it('file nhị phân giả đuôi', async () => {
    await fails(Buffer.from([0x00, 0x01, 0x02, 0x03]), 'unsupported_file');
  });

  it('quá số dòng cho phép', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row({}));
    await fails(file(...rows), 'too_many_rows');
    const ok = await parseQuestionImportFile(file(...rows.slice(0, MAX_IMPORT_ROWS)));
    expect(ok.rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});
