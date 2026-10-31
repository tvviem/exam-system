import { MATH_MAX_PER_QUESTION, type RichText, textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import {
  clusterRow,
  essayRow,
  HEADERS,
  type ImportRow,
  importRow,
  importWorkbook,
  rawWorkbook,
  SHEET,
} from '../../../../test/support/question-import-files';
import {
  MAX_IMPORT_ROWS,
  parseQuestionImportFile,
  QuestionImportFileError,
} from './question-import-file';

async function parse(...rows: ImportRow[]) {
  return parseQuestionImportFile(await importWorkbook(rows));
}

async function parseOne(row: ImportRow) {
  const { rows } = await parse(row);
  const [only] = rows;
  if (!only) throw new Error('không có dòng nào');
  return only;
}

interface ChoiceOver {
  stem?: string;
  options?: readonly string[];
  answer?: string;
  points?: string;
  rule?: string;
  tags?: string;
}

/** Câu chọn một hoặc chọn nhiều (theo số chữ trong `answer`) với giá trị mặc định hợp lệ. */
const choice = (over: ChoiceOver = {}) =>
  importRow(
    over.stem ?? 'Đạo hàm của x² là gì?',
    [...(over.options ?? ['x', '2x', 'x²'])],
    over.answer ?? 'B',
    { points: over.points, rule: over.rule, tags: over.tags },
  );

/** Cùng dữ liệu nhưng đặt vào sheet "Chọn nhiều", để thử một đáp án ở sheet đó. */
const inMultiple = (row: ImportRow): ImportRow => ({ ...row, sheet: SHEET.multiple });

interface ClusterOver {
  stem?: string;
  statements?: readonly string[];
  answer?: string;
  points?: string;
  rule?: string;
  ladder?: string;
}

const cluster = (over: ClusterOver = {}) =>
  clusterRow(
    over.stem ?? 'Cho hàm số y = x². Xét các nhận định:',
    [...(over.statements ?? ['Hàm số đồng biến trên R', 'Đồ thị là một parabol', 'Hàm số chẵn'])],
    over.answer ?? 'S,Đ,Đ',
    { points: over.points, rule: over.rule, ladder: over.ladder },
  );

describe('Câu chọn một', () => {
  it('mã Phương án o1, o2... theo thứ tự cột; điểm trống là 1', async () => {
    const parsed = await parseOne(choice({ tags: 'Đạo hàm, Lớp 12' }));
    expect(parsed.error).toBeNull();
    expect(parsed.type).toBe('single_choice');
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

  it('chữ đáp án không phân biệt hoa thường; dùng được tám Phương án', async () => {
    const parsed = await parseOne(
      choice({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], answer: 'h' }),
    );
    expect(parsed.input).toMatchObject({ payload: { key: ['o8'] } });
  });

  it('hai đáp án ở sheet "Chọn một" là lỗi, không tự đổi thành Câu chọn nhiều', async () => {
    const parsed = await parseOne({ ...choice({ answer: 'A,C' }), sheet: SHEET.single });
    expect(parsed.error).toBe('answer_mismatch');
  });
});

describe('Câu chọn nhiều', () => {
  it('Quy tắc chấm trống thì lấy Tỷ lệ', async () => {
    const parsed = await parseOne(choice({ answer: 'A, C' }));
    expect(parsed.type).toBe('multiple_choice');
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
    const parsed = await parseOne(choice({ answer: 'A;B', rule: text }));
    expect(parsed.input).toMatchObject({ payload: { scoringRule: rule } });
  });

  it('một chữ ở sheet "Chọn nhiều" vẫn là Câu chọn nhiều', async () => {
    const parsed = await parseOne(inMultiple(choice({ answer: 'B' })));
    expect(parsed.error).toBeNull();
    expect(parsed.input).toMatchObject({ type: 'multiple_choice', payload: { key: ['o2'] } });
  });
});

describe('Chùm đúng/sai', () => {
  it('mỗi Mệnh đề có mã s1, s2... và đáp án Đ/S theo thứ tự; Quy tắc chấm trống là Tỷ lệ', async () => {
    const parsed = await parseOne(cluster());
    expect(parsed.error).toBeNull();
    expect(parsed.type).toBe('true_false_cluster');
    expect(parsed.input).toMatchObject({
      type: 'true_false_cluster',
      defaultPoints: 1,
      payload: {
        statements: [
          { id: 's1', content: textDoc('Hàm số đồng biến trên R'), key: false },
          { id: 's2', content: textDoc('Đồ thị là một parabol'), key: true },
          { id: 's3', content: textDoc('Hàm số chẵn'), key: true },
        ],
        scoringRule: 'proportional',
      },
    });
  });

  it.each([
    ['Đ,S,Đ', [true, false, true]],
    ['đ s đ', [true, false, true]],
    ['Đúng; Sai; Đúng', [true, false, true]],
    ['dung, sai, dung', [true, false, true]],
    ['D S D', [true, false, true]],
  ])('đáp án "%s" → %j', async (answer, keys) => {
    const parsed = await parseOne(cluster({ answer }));
    expect(parsed.error).toBeNull();
    const payload = parsed.input?.payload as { statements: { key: boolean }[] };
    expect(payload.statements.map((s) => s.key)).toEqual(keys);
  });

  it('Quy tắc Đúng hết', async () => {
    const parsed = await parseOne(cluster({ rule: 'Đúng hết' }));
    expect(parsed.input).toMatchObject({ payload: { scoringRule: 'all_or_nothing' } });
  });

  it('Bậc thang: phân cách bằng dấu chấm phẩy, số thập phân dùng dấu phẩy hoặc chấm', async () => {
    const parsed = await parseOne(
      cluster({
        statements: ['a', 'b', 'c', 'd'],
        answer: 'Đ,S,Đ,S',
        rule: 'Bậc thang',
        ladder: '0; 0,1; 0.25; 0,5; 1',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.input).toMatchObject({
      payload: { scoringRule: 'ladder', ladder: [0, 0.1, 0.25, 0.5, 1] },
    });
  });

  it('có thể dùng công thức trong Mệnh đề', async () => {
    const parsed = await parseOne(cluster({ statements: ['$x^2 \\geq 0$', 'b', 'c'] }));
    expect(parsed.error).toBeNull();
    const bad = await parseOne(cluster({ statements: ['$\\frac{1$', 'b', 'c'] }));
    expect(bad.error).toBe('math_invalid');
  });

  it('một Mệnh đề là đủ', async () => {
    const parsed = await parseOne(cluster({ statements: ['Chỉ một'], answer: 'Đ' }));
    expect(parsed.error).toBeNull();
  });

  const ladderRule = { rule: 'Bậc thang' };
  it.each([
    ['thiếu đáp án cho một Mệnh đề', { answer: 'Đ,S' }, 'invalid_statement_key'],
    ['thừa đáp án', { answer: 'Đ,S,Đ,S' }, 'invalid_statement_key'],
    ['đáp án không phải Đ hoặc S', { answer: 'Đ,X,Đ' }, 'invalid_statement_key'],
    ['đáp án trống', { answer: '' }, 'invalid_statement_key'],
    ['Mệnh đề trống ở giữa', { statements: ['a', '', 'c'] }, 'gap_in_options'],
    ['không có Mệnh đề nào', { statements: [] }, 'too_few_options'],
    ['Quy tắc chấm không hiểu', { rule: 'Cộng dồn' }, 'invalid_scoring_rule'],
    ['Bậc thang thiếu Bậc thang', ladderRule, 'invalid_ladder'],
    ['Bậc thang sai độ dài', { ...ladderRule, ladder: '0; 0,5; 1' }, 'invalid_ladder'],
    [
      'Bậc thang không bắt đầu từ 0',
      { ...ladderRule, ladder: '0,1; 0,2; 0,5; 1' },
      'invalid_ladder',
    ],
    [
      'Bậc thang không kết thúc ở 1',
      { ...ladderRule, ladder: '0; 0,2; 0,5; 0,9' },
      'invalid_ladder',
    ],
    ['Bậc thang giảm dần', { ...ladderRule, ladder: '0; 0,5; 0,2; 1' }, 'invalid_ladder'],
    ['Bậc thang vượt 1', { ...ladderRule, ladder: '0; 0,5; 1,5; 1' }, 'invalid_ladder'],
    ['Bậc thang không phải số', { ...ladderRule, ladder: '0; a; 0,5; 1' }, 'invalid_ladder'],
    ['Bậc thang cách bằng dấu phẩy', { ...ladderRule, ladder: '0, 0.5, 0.7, 1' }, 'invalid_ladder'],
    [
      'có Bậc thang nhưng quy tắc khác',
      { rule: 'Tỷ lệ', ladder: '0; 0,5; 0,7; 1' },
      'invalid_ladder',
    ],
    ['Mệnh đề quá 2.000 ký tự', { statements: ['x'.repeat(2001), 'b', 'c'] }, 'field_too_long'],
    ['điểm sai', { points: '0,07' }, 'invalid_points'],
  ] as const)('%s → %s', async (_name, over: ClusterOver, code) => {
    const parsed = await parseOne(cluster(over));
    expect(parsed.error).toBe(code);
    expect(parsed.input).toBeNull();
  });
});

describe('Câu tự luận', () => {
  it('độ dài tối đa trống là 2.000, không có hướng dẫn chấm', async () => {
    const parsed = await parseOne(essayRow('Trình bày khái niệm đệ quy.'));
    expect(parsed.error).toBeNull();
    expect(parsed.type).toBe('essay');
    expect(parsed.input).toEqual({
      type: 'essay',
      stem: textDoc('Trình bày khái niệm đệ quy.'),
      defaultPoints: 1,
      tags: [],
      payload: { maxLength: 2000 },
    });
  });

  it('độ dài tối đa và hướng dẫn chấm (có công thức)', async () => {
    const parsed = await parseOne(
      essayRow('Chứng minh bằng quy nạp.', {
        maxLength: '500',
        rubric: 'Bước cơ sở $n=1$: 0,5 điểm.',
        points: '2,5',
      }),
    );
    expect(parsed.error).toBeNull();
    expect(parsed.input).toMatchObject({ defaultPoints: 2.5, payload: { maxLength: 500 } });
    const payload = parsed.input?.payload as { rubric?: RichText };
    expect(payload.rubric?.content[0]).toMatchObject({
      content: [
        { type: 'text', text: 'Bước cơ sở ' },
        { type: 'math', attrs: { latex: 'n=1' } },
        { type: 'text', text: ': 0,5 điểm.' },
      ],
    });
  });

  it.each([
    ['dưới 100', { maxLength: '99' }, 'invalid_max_length'],
    ['trên 5.000', { maxLength: '5001' }, 'invalid_max_length'],
    ['không phải số', { maxLength: 'dài' }, 'invalid_max_length'],
    ['số thập phân', { maxLength: '150,5' }, 'invalid_max_length'],
    ['dạng khoa học', { maxLength: '1e3' }, 'invalid_max_length'],
    ['hướng dẫn chấm có công thức sai', { rubric: 'Sai $\\frac{1$' }, 'math_invalid'],
    ['điểm sai', { points: 'mười' }, 'invalid_points'],
  ] as const)('độ dài/hướng dẫn: %s → %s', async (_name, extra, code) => {
    const parsed = await parseOne(essayRow('Nội dung', extra));
    expect(parsed.error).toBe(code);
  });

  it('thiếu nội dung', async () => {
    expect((await parseOne(essayRow('  ', { rubric: 'Có hướng dẫn' }))).error).toBe(
      'missing_content',
    );
  });
});

describe('điểm và tiêu đề cột', () => {
  it.each([
    ['', 1],
    ['2', 2],
    ['0,5', 0.5],
    ['0.05', 0.05],
    ['0.1', 0.1],
    ['0,15', 0.15],
    ['0.25', 0.25],
    ['0,75', 0.75],
    ['0,2', 0.2],
    ['0.3', 0.3],
    ['2,5', 2.5],
    ['99.9', 99.9],
    ['100', 100],
  ])('điểm "%s" → %s', async (text, points) => {
    const parsed = await parseOne(choice({ points: text }));
    expect(parsed.error).toBeNull();
    expect(parsed.input?.defaultPoints).toBe(points);
  });

  it('tiêu đề cột khớp không phân biệt hoa thường và dấu; cột lạ bị bỏ qua; số dòng là số thật trong sheet', async () => {
    const content = await rawWorkbook({
      'Chọn một': [
        ['STT', 'NOI DUNG', 'phuong an a', 'Phương án  B', 'DAP AN'],
        ['1', 'Câu một', 'a', 'b', 'A'],
        ['', '', '', '', ''],
        ['3', 'Câu ba', 'a', 'b', 'B'],
      ],
    });
    const { rows } = await parseQuestionImportFile(content);
    expect(rows.map((r) => [r.rowNumber, r.error])).toEqual([
      [2, null],
      [4, null],
    ]);
  });

  it('ô điểm là số trong Excel vẫn đọc được', async () => {
    const content = await rawWorkbook({
      'Chọn một': [
        ['Nội dung', 'Phương án A', 'Phương án B', 'Đáp án', 'Điểm'],
        ['Hai cộng hai?', '3', '4', 'B', 0.5],
      ],
    });
    const { rows } = await parseQuestionImportFile(content);
    expect(rows[0]?.input).toMatchObject({ defaultPoints: 0.5, payload: { key: ['o2'] } });
  });
});

describe('sheet trong file (Q156)', () => {
  const oneQuestion = ['Hai cộng hai?', '3', '4', 'B'];
  const singleHeader = ['Nội dung', 'Phương án A', 'Phương án B', 'Đáp án'];

  it('chỉ dùng sheet "Chọn một": các sheet khác để trống hoặc bị xóa đều được', async () => {
    const onlyOne = await rawWorkbook({ [SHEET.single]: [singleHeader, oneQuestion] });
    expect((await parseQuestionImportFile(onlyOne)).rows).toHaveLength(1);

    const withEmpty = await rawWorkbook({
      [SHEET.single]: [singleHeader, oneQuestion],
      [SHEET.multiple]: [HEADERS[SHEET.multiple]],
      [SHEET.cluster]: [],
      [SHEET.essay]: [HEADERS[SHEET.essay]],
    });
    expect((await parseQuestionImportFile(withEmpty)).rows).toHaveLength(1);
  });

  it('trộn các Loại: dòng xếp theo thứ tự sheet của mẫu, số dòng tính trong từng sheet', async () => {
    const { rows } = await parse(
      essayRow('Tự luận 1'),
      choice({ stem: 'Một 1' }),
      cluster({ stem: 'Chùm 1' }),
      choice({ stem: 'Một 2' }),
      choice({ stem: 'Nhiều 1', answer: 'A,B' }),
    );
    expect(rows.map((r) => [r.type, r.rowNumber])).toEqual([
      ['single_choice', 2],
      ['single_choice', 3],
      ['multiple_choice', 2],
      ['true_false_cluster', 2],
      ['essay', 2],
    ]);
  });

  it('tên sheet không phân biệt hoa thường và dấu; sheet "Hướng dẫn" được bỏ qua', async () => {
    const content = await rawWorkbook({
      'Hướng dẫn': [['Đọc kỹ trước khi điền']],
      'chon mot': [singleHeader, ['x', 'a', 'b', 'A']],
      'TỰ LUẬN': [['Nội dung'], ['Trình bày']],
    });
    const { rows } = await parseQuestionImportFile(content);
    expect(rows.map((r) => r.type)).toEqual(['single_choice', 'essay']);
  });

  const fails = async (content: Buffer, code: string, sheet?: string) => {
    const error = await parseQuestionImportFile(content).catch((e) => e);
    expect(error).toBeInstanceOf(QuestionImportFileError);
    expect((error as QuestionImportFileError).code).toBe(code);
    if (sheet) expect((error as QuestionImportFileError).sheet).toBe(sheet);
  };

  it('sheet lạ làm cả file bị từ chối, kèm tên sheet', async () => {
    await fails(
      await rawWorkbook({
        [SHEET.single]: [singleHeader, oneQuestion],
        'Câu hỏi': [['Nội dung'], ['x']],
      }),
      'unknown_sheet',
      'Câu hỏi',
    );
  });

  it('hai sheet cùng một Loại bị từ chối', async () => {
    await fails(
      await rawWorkbook({
        'Chọn một': [singleHeader, oneQuestion],
        'chon mot': [singleHeader, oneQuestion],
      }),
      'duplicate_sheet',
    );
  });

  it('sheet có dữ liệu mà thiếu cột bắt buộc: báo kèm tên sheet', async () => {
    await fails(
      await rawWorkbook({
        'Chùm đúng sai': [
          ['Nội dung', 'Mệnh đề a'],
          ['x', 'y'],
        ],
      }),
      'missing_columns',
      'Chùm đúng sai',
    );
    await fails(
      await rawWorkbook({
        'Chọn một': [
          ['Nội dung', 'Phương án A'],
          ['x', 'y'],
        ],
      }),
      'missing_columns',
      'Chọn một',
    );
  });

  it('mọi sheet đều không có dòng dữ liệu', async () => {
    await fails(await importWorkbook([]), 'empty_file');
    await fails(await rawWorkbook({ [SHEET.single]: [HEADERS[SHEET.single]] }), 'empty_file');
  });

  it('file CSV không còn được nhận cho Nhập Câu hỏi', async () => {
    await fails(
      Buffer.from('Nội dung,Phương án A,Phương án B,Đáp án\nx,a,b,A', 'utf8'),
      'unsupported_file',
    );
  });

  it('file nhị phân giả đuôi', async () => {
    await fails(Buffer.from([0x00, 0x01, 0x02, 0x03]), 'unsupported_file');
  });

  it('quá số dòng cho phép tính chung các sheet', async () => {
    const half = Math.floor(MAX_IMPORT_ROWS / 2);
    const make = (singles: number, essays: number) => [
      ...Array.from({ length: singles }, () => choice()),
      ...Array.from({ length: essays }, () => essayRow('Nội dung')),
    ];
    await fails(await importWorkbook(make(half + 1, half)), 'too_many_rows');
    const ok = await parse(...make(half, half));
    expect(ok.rows).toHaveLength(MAX_IMPORT_ROWS);
  });
});

describe('công thức và xuống dòng trong ô (Q145)', () => {
  const inline = (parsed: Awaited<ReturnType<typeof parseOne>>) =>
    parsed.input?.stem.content[0] && 'content' in parsed.input.stem.content[0]
      ? parsed.input.stem.content[0].content
      : undefined;
  const stemOf = (stem: string) => parseOne(choice({ stem }));

  it('$...$ thành công thức trong dòng, chữ xung quanh giữ nguyên', async () => {
    const parsed = await stemOf('Tính $x^2$ nhé');
    expect(parsed.error).toBeNull();
    expect(inline(parsed)).toEqual([
      { type: 'text', text: 'Tính ' },
      { type: 'math', attrs: { latex: 'x^2', display: false } },
      { type: 'text', text: ' nhé' },
    ]);
  });

  it('công thức cũng dùng được trong Phương án', async () => {
    const parsed = await parseOne(choice({ options: ['$\\frac{1}{2}$', '1', '2'] }));
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
    expect(inline(await stemOf(cell))).toEqual([{ type: 'text', text: expected }]);
  });

  it('xuống dòng trong ô thành hardBreak', async () => {
    expect(inline(await stemOf('Dòng một\nDòng hai'))).toEqual([
      { type: 'text', text: 'Dòng một' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Dòng hai' },
    ]);
  });

  it('LaTeX không dựng được hoặc có lệnh cấm là lỗi của dòng', async () => {
    expect((await stemOf('Sai $\\frac{1$')).error).toBe('math_invalid');
    expect((await stemOf('Cấm $\\href{http://x}{y}$')).error).toBe('math_forbidden');
  });

  it('quá số công thức cho phép trong một Câu hỏi là lỗi', async () => {
    const many = Array.from({ length: MATH_MAX_PER_QUESTION + 1 }, (_, i) => `$a${i}$`).join(' ');
    expect((await stemOf(many)).error).toBe('too_many_formulas');
  });
});

describe('lỗi từng dòng của Câu chọn (Q123, Q145)', () => {
  it.each([
    ['thiếu nội dung', { stem: '  ' }, 'missing_content'],
    ['ít hơn 2 Phương án', { options: ['chỉ một'], answer: 'A' }, 'too_few_options'],
    ['Phương án trống ở giữa', { options: ['a', '', 'c'], answer: 'A' }, 'gap_in_options'],
    ['đáp án trống', { answer: '' }, 'answer_mismatch'],
    ['đáp án trỏ Phương án không có', { options: ['a', 'b'], answer: 'C' }, 'answer_mismatch'],
    ['đáp án không phải chữ cái', { answer: '2' }, 'answer_mismatch'],
    ['đáp án lặp', { answer: 'A,A' }, 'answer_mismatch'],
    ['điểm không phải số', { points: 'mười' }, 'invalid_points'],
    ['điểm dạng thập lục phân', { points: '0x10' }, 'invalid_points'],
    ['điểm dạng khoa học', { points: '1e1' }, 'invalid_points'],
    ['điểm không chia hết 0,05', { points: '0,07' }, 'invalid_points'],
    ['điểm có ba chữ số thập phân', { points: '0,125' }, 'invalid_points'],
    ['điểm bằng 0', { points: '0' }, 'invalid_points'],
    ['điểm dưới 0,05', { points: '0,01' }, 'invalid_points'],
    ['điểm trên 100', { points: '101' }, 'invalid_points'],
    ['Quy tắc chấm không hiểu', { answer: 'A,B', rule: 'Bậc thang' }, 'invalid_scoring_rule'],
    ['Phương án quá 2.000 ký tự', { options: ['x'.repeat(2001), 'b'] }, 'field_too_long'],
    ['Nội dung quá 20.000 ký tự', { stem: 'x'.repeat(20_001) }, 'field_too_long'],
    [
      'quá 10 tag',
      { tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') },
      'too_many_tags',
    ],
    ['tag quá 30 ký tự', { tags: 'x'.repeat(31) }, 'field_too_long'],
  ] as const)('%s → %s', async (_name, over: ChoiceOver, code) => {
    const parsed = await parseOne(choice(over));
    expect(parsed.error).toBe(code);
    expect(parsed.input).toBeNull();
  });

  it('một dòng lỗi không làm hỏng dòng khác', async () => {
    const { rows } = await parse(choice(), choice({ answer: '' }), choice({ answer: 'A,C' }));
    // dòng 1 và 2 ở sheet "Chọn một", dòng 3 ở sheet "Chọn nhiều"
    expect(rows.map((r) => r.error)).toEqual([null, 'answer_mismatch', null]);
  });
});
