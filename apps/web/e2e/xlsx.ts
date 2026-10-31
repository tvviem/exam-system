import { createRequire } from 'node:module';

// exceljs là phụ thuộc của api, E2E mượn lại để dựng file Excel thử (như prepare-api.cjs mượn pg và ioredis).
const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));

interface ExcelWorkbook {
  addWorksheet(name: string): { addRow(cells: string[]): void };
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}
const { Workbook } = apiRequire('exceljs') as { Workbook: new () => ExcelWorkbook };

/** File `.xlsx` từ các sheet (tên sheet → các dòng, dòng đầu là tiêu đề). */
export async function workbook(sheets: Record<string, string[][]>): Promise<Buffer> {
  const book = new Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = book.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
