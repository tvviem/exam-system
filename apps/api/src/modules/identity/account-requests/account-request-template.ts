import ExcelJS from 'exceljs';

/** File mẫu Người ra đề tải về điền (Q88). Ví dụ nằm ở sheet riêng để không bị tải lên nhầm. */
export async function buildAccountRequestTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('Danh sách');
  sheet.columns = [
    { header: 'Họ tên', key: 'fullName', width: 28 },
    { header: 'Mã định danh', key: 'code', width: 18, style: { numFmt: '@' } },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Lớp', key: 'classLabel', width: 16 },
    { header: 'Ngày sinh', key: 'dateOfBirth', width: 14, style: { numFmt: '@' } },
    { header: 'Giới tính', key: 'gender', width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 110;
  const lines = [
    'Điền danh sách ở sheet "Danh sách", mỗi người một dòng, bắt đầu từ dòng 2. Xóa hoặc để trống các dòng không dùng.',
    'Họ tên: bắt buộc.',
    'Mã định danh và Email: cần ít nhất một trong hai. Mã định danh (nếu có) làm tên đăng nhập, nếu không có thì dùng Email.',
    'Lớp: không bắt buộc.',
    'Ngày sinh: dạng 15/03/2005 (không bắt buộc).',
    'Giới tính: Nam, Nữ hoặc Khác (không bắt buộc).',
    'Tối đa 2.000 dòng và 2 MB mỗi file. Nhận file .xlsx hoặc .csv (UTF-8).',
    'Ví dụ một dòng: Nguyễn Văn An | B2103456 | an@example.edu.vn | CNTT-K21 | 15/03/2005 | Nam',
  ];
  for (const line of lines) guide.addRow([line]);
  guide.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
