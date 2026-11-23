import ExcelJS from 'exceljs';
import { safeCell } from '../../common/safe-cell';
import type { SessionPaperPerson } from '../../common/session-info';

/**
 * Excel phân Mã đề (Q473): ai nhận Mã đề nào, để in danh sách phòng thi và phát đúng đề. Xếp theo Mã đề rồi theo tên (danh sách đã
 * xếp theo tên từ danh bạ). Ô bắt đầu bằng ký tự công thức được đệm dấu nháy như Excel Kết quả (Q304).
 */
export async function buildAssignmentWorkbook(input: {
  title: string;
  people: readonly SessionPaperPerson[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Phân Mã đề');
  sheet.addRow(['Tên Phiên thi', safeCell(input.title)]);
  sheet.addRow(['Số người', input.people.length]);
  sheet.addRow([]);
  const header = sheet.addRow(['Mã định danh', 'Họ và tên', 'Lớp', 'Mã đề']);
  header.font = { bold: true };
  const ordered = [...input.people].sort(
    (a, b) =>
      (a.variantNumber ?? Number.MAX_SAFE_INTEGER) - (b.variantNumber ?? Number.MAX_SAFE_INTEGER),
  );
  for (const person of ordered) {
    sheet.addRow([
      safeCell(person.code ?? ''),
      safeCell(person.fullName),
      safeCell(person.classLabel ?? ''),
      safeCell(person.variantLabel ?? ''),
    ]);
  }
  sheet.columns.forEach((column, index) => {
    column.width = [16, 28, 14, 12][index] ?? 14;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
