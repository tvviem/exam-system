import ExcelJS from 'exceljs';

/** Tên bốn sheet dữ liệu của file Nhập Excel (Q156), theo thứ tự trong mẫu. */
export const SHEET = {
  single: 'Chọn một',
  multiple: 'Chọn nhiều',
  cluster: 'Chùm đúng sai',
  essay: 'Tự luận',
} as const;
export type SheetName = (typeof SHEET)[keyof typeof SHEET];

const range = (from: string) =>
  Array.from({ length: 8 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));
const choiceColumns = range('A').map((l) => `Phương án ${l}`);
const statementColumns = range('a').map((l) => `Mệnh đề ${l}`);

/** Dòng tiêu đề của từng sheet, đúng như file mẫu. */
export const HEADERS: Record<SheetName, string[]> = {
  [SHEET.single]: ['Nội dung', ...choiceColumns, 'Đáp án', 'Điểm', 'Tags'],
  [SHEET.multiple]: ['Nội dung', ...choiceColumns, 'Đáp án', 'Điểm', 'Quy tắc chấm', 'Tags'],
  [SHEET.cluster]: [
    'Nội dung',
    ...statementColumns,
    'Đáp án',
    'Điểm',
    'Quy tắc chấm',
    'Bậc thang',
    'Tags',
  ],
  [SHEET.essay]: ['Nội dung', 'Độ dài tối đa', 'Hướng dẫn chấm', 'Điểm', 'Tags'],
};

/** Một dòng dữ liệu: sheet nó thuộc về và giá trị theo tên cột (ô không nêu thì để trống). */
export interface ImportRow {
  sheet: string;
  values: Record<string, string>;
}

/** Câu chọn một hoặc chọn nhiều; từ hai chữ trong `answer` thì vào sheet "Chọn nhiều". */
export const importRow = (
  stem: string,
  options: string[],
  answer: string,
  extra: { points?: string; rule?: string; tags?: string } = {},
): ImportRow => {
  const values: Record<string, string> = {
    'Nội dung': stem,
    'Đáp án': answer,
    Điểm: extra.points ?? '',
    'Quy tắc chấm': extra.rule ?? '',
    Tags: extra.tags ?? '',
  };
  options.forEach((option, i) => {
    values[choiceColumns[i] as string] = option;
  });
  return { sheet: /[\s,;]/.test(answer.trim()) ? SHEET.multiple : SHEET.single, values };
};

export const clusterRow = (
  stem: string,
  statements: string[],
  answer: string,
  extra: { points?: string; rule?: string; ladder?: string; tags?: string } = {},
): ImportRow => {
  const values: Record<string, string> = {
    'Nội dung': stem,
    'Đáp án': answer,
    Điểm: extra.points ?? '',
    'Quy tắc chấm': extra.rule ?? '',
    'Bậc thang': extra.ladder ?? '',
    Tags: extra.tags ?? '',
  };
  statements.forEach((statement, i) => {
    values[statementColumns[i] as string] = statement;
  });
  return { sheet: SHEET.cluster, values };
};

export const essayRow = (
  stem: string,
  extra: { maxLength?: string; rubric?: string; points?: string; tags?: string } = {},
): ImportRow => ({
  sheet: SHEET.essay,
  values: {
    'Nội dung': stem,
    'Độ dài tối đa': extra.maxLength ?? '',
    'Hướng dẫn chấm': extra.rubric ?? '',
    Điểm: extra.points ?? '',
    Tags: extra.tags ?? '',
  },
});

/** File `.xlsx` từ các sheet thô (tên sheet → các dòng, dòng đầu là tiêu đề), cho test lỗi cấu trúc file. */
export async function rawWorkbook(sheets: Record<string, (string | number)[][]>) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** File `.xlsx` với tiêu đề của mẫu; chỉ tạo sheet nào có dòng, theo thứ tự mẫu. */
export async function importWorkbook(rows: ImportRow[]) {
  const sheets: Record<string, string[][]> = {};
  for (const name of Object.values(SHEET)) {
    const own = rows.filter((row) => row.sheet === name);
    if (own.length === 0) continue;
    const header = HEADERS[name];
    sheets[name] = [header, ...own.map((row) => header.map((title) => row.values[title] ?? ''))];
  }
  return rawWorkbook(sheets);
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Phần tệp tải lên (multipart) cho một file nhập Câu hỏi. */
export const importFile = async (...rows: ImportRow[]) => ({
  filename: 'cau-hoi.xlsx',
  content: await importWorkbook(rows),
  contentType: XLSX_TYPE,
});
