import ExcelJS from 'exceljs';

export const CSV_HEADER = 'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính';

export const csvFile = (...lines: string[]) => ({
  filename: 'danh-sach.csv',
  content: Buffer.from([CSV_HEADER, ...lines].join('\n'), 'utf8'),
  contentType: 'text/csv',
});

export async function xlsxFile(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách');
  sheet.addRow(CSV_HEADER.split(','));
  for (const row of rows) sheet.addRow(row);
  return {
    filename: 'danh-sach.xlsx',
    content: Buffer.from(await workbook.xlsx.writeBuffer()),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
