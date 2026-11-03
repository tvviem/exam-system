import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readTable, readWorkbook } from './spreadsheet';

// Chữ Việt trong file nhập phải vào hệ thống ở dạng dựng sẵn (NFC) dù file lưu dấu rời (NFD): cùng một chữ thì cùng một
// chuỗi và cùng số ký tự trong mọi Câu hỏi, Bộ đề và Phiên thi.

const NFC = 'Nguyễn Việt Hoàng';
const NFD = NFC.normalize('NFD');

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Chọn một');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('đọc file nhập chuẩn hóa chữ Việt về NFC', () => {
  it('ô xlsx ở dạng dấu rời ra ở dạng dựng sẵn, cả dòng tiêu đề', async () => {
    expect(NFD).not.toBe(NFC); // chắc chắn dữ liệu thử đúng là dấu rời
    const table = await readTable(
      await xlsx([
        [NFD, 'Câu hỏi'],
        [NFD, 'x²'],
      ]),
      10,
    );
    expect(table.header[0]).toBe(NFC);
    expect(table.records[0]?.cells[0]).toBe(NFC);
    expect(table.records[0]?.cells[0]).toHaveLength(NFC.length);
  });

  it('ô nhiều định dạng (richText) cũng được chuẩn hóa', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Chọn một');
    sheet.addRow(['Tiêu đề']);
    sheet.addRow([{ richText: [{ text: NFD.slice(0, 8) }, { text: NFD.slice(8) }] }]);
    const table = await readTable(Buffer.from(await workbook.xlsx.writeBuffer()), 10);
    expect(table.records[0]?.cells[0]).toBe(NFC);
  });

  it('mọi sheet của file nhập Câu hỏi', async () => {
    const [sheet] = await readWorkbook(await xlsx([['STT'], [NFD]]), 10);
    expect(sheet?.table.records[0]?.cells[0]).toBe(NFC);
  });

  it('file CSV dấu rời cũng ra dạng dựng sẵn', async () => {
    const table = await readTable(
      Buffer.from(`Họ tên,Lớp\n${NFD},12A\n`.normalize('NFD'), 'utf8'),
      10,
    );
    expect(table.header[0]).toBe('Họ tên');
    expect(table.records[0]?.cells[0]).toBe(NFC);
  });
});
