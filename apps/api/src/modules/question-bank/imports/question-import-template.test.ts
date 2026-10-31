import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { HEADERS, SHEET } from '../../../../test/support/question-import-files';
import { parseQuestionImportFile, QuestionImportFileError } from './question-import-file';
import {
  buildQuestionImportExample,
  buildQuestionImportTemplate,
} from './question-import-template';

async function open(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe('file mẫu nhập Câu hỏi (Q157)', () => {
  it('có sheet "Hướng dẫn" rồi bốn sheet dữ liệu, tiêu đề đúng như bộ đọc mong đợi', async () => {
    const workbook = await open(await buildQuestionImportTemplate());
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Hướng dẫn', ...Object.values(SHEET)]);
    for (const name of Object.values(SHEET)) {
      const header = [...((workbook.getWorksheet(name)?.getRow(1).values ?? []) as string[])].slice(
        1,
      );
      expect(header).toEqual(HEADERS[name]);
    }
  });

  it('file mẫu trống không có dòng dữ liệu nào: tải lên nguyên trạng bị báo trống, không nhập nhầm câu mẫu', async () => {
    const error = await parseQuestionImportFile(await buildQuestionImportTemplate()).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(QuestionImportFileError);
    expect((error as QuestionImportFileError).code).toBe('empty_file');
  });

  it('sheet "Hướng dẫn" nêu cột của từng sheet', async () => {
    const workbook = await open(await buildQuestionImportTemplate());
    const guide = workbook.getWorksheet('Hướng dẫn');
    const text: string[] = [];
    guide?.eachRow((row) => text.push(row.values ? (row.values as unknown[]).join(' ') : ''));
    const all = text.join('\n');
    for (const name of Object.values(SHEET)) expect(all).toContain(`Sheet "${name}"`);
    expect(all).toContain('Bậc thang');
    expect(all).toContain('0,05');
  });
});

describe('file ví dụ nhập Câu hỏi (Q157)', () => {
  it('có 8 câu hợp lệ, mỗi Loại 2 câu, đọc không lỗi', async () => {
    const { rows } = await parseQuestionImportFile(await buildQuestionImportExample());
    expect(rows.map((r) => r.error)).toEqual(Array(8).fill(null));
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.type] = (counts[row.type] ?? 0) + 1;
    expect(counts).toEqual({
      single_choice: 2,
      multiple_choice: 2,
      true_false_cluster: 2,
      essay: 2,
    });
  });

  it('số dòng của từng sheet là 2 và 3, ngay dưới dòng tiêu đề', async () => {
    const { rows } = await parseQuestionImportFile(await buildQuestionImportExample());
    expect(rows.map((r) => [r.type, r.rowNumber])).toEqual([
      ['single_choice', 2],
      ['single_choice', 3],
      ['multiple_choice', 2],
      ['multiple_choice', 3],
      ['true_false_cluster', 2],
      ['true_false_cluster', 3],
      ['essay', 2],
      ['essay', 3],
    ]);
  });

  it('mệnh đề ví dụ về số cạnh tối đa của đồ thị đơn 5 đỉnh (10 cạnh) viết đủ nghĩa để đáp án Sai không mơ hồ', async () => {
    const { rows } = await parseQuestionImportFile(await buildQuestionImportExample());
    const graph = rows.find((r) => JSON.stringify(r.input).includes('đồ thị đơn có'));
    const payload = graph?.input?.payload as { statements: { content: unknown; key: boolean }[] };
    const wrong = payload.statements[3];
    // "có thể có 20 cạnh" mới sai thật; "tối đa 20 cạnh" đúng theo nghĩa đen (10 ≤ 20).
    expect(JSON.stringify(wrong?.content)).toContain('có thể có');
    expect(JSON.stringify(wrong?.content)).not.toContain('tối đa');
    expect(wrong?.key).toBe(false);
  });

  it('có công thức và Bậc thang bước 0,1 như hướng dẫn', async () => {
    const { rows } = await parseQuestionImportFile(await buildQuestionImportExample());
    const cluster = rows.find((r) => r.type === 'true_false_cluster');
    expect(cluster?.input).toMatchObject({
      payload: { scoringRule: 'ladder', ladder: [0, 0.1, 0.25, 0.5, 1] },
    });
    expect(JSON.stringify(rows.map((r) => r.input))).toContain('"type":"math"');
  });
});
