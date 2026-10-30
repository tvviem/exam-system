import { TAG_MAX_CHARS, TAGS_MAX } from '@exam/shared';
import ExcelJS from 'exceljs';
import { MAX_UPLOAD_BYTES } from '../../../common/spreadsheet';
import { MAX_IMPORT_ROWS, MAX_OPTIONS } from './question-import-file';

/** File mẫu Nhập Excel Câu hỏi (Q123, Q145). Hướng dẫn và ví dụ ở sheet riêng để không bị tải lên nhầm. */
export async function buildQuestionImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet('Câu hỏi');
  sheet.columns = [
    { header: 'Nội dung', key: 'content', width: 48 },
    ...Array.from({ length: MAX_OPTIONS }, (_, i) => String.fromCharCode(65 + i)).map((letter) => ({
      header: `Phương án ${letter}`,
      key: `option${letter}`,
      width: 20,
    })),
    { header: 'Đáp án', key: 'answer', width: 10 },
    { header: 'Điểm', key: 'points', width: 8 },
    { header: 'Quy tắc chấm', key: 'rule', width: 16 },
    { header: 'Tags', key: 'tags', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getColumn('answer').numFmt = '@';

  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 120;
  const lines = [
    'Điền câu hỏi ở sheet "Câu hỏi", mỗi câu một dòng, bắt đầu từ dòng 2. Xóa hoặc để trống các dòng không dùng.',
    'Chỉ nhập Câu chọn một và Câu chọn nhiều. Câu đúng/sai và tự luận soạn trực tiếp trên màn hình.',
    'Nội dung: bắt buộc. Xuống dòng trong ô (Alt+Enter) được giữ nguyên.',
    `Phương án A đến ${String.fromCharCode(64 + MAX_OPTIONS)}: ít nhất A và B; điền liên tục từ A, không để ô trống ở giữa.`,
    'Đáp án: chữ cái của Phương án đúng. Một chữ (B) là Câu chọn một; từ hai chữ (A,C) là Câu chọn nhiều.',
    'Điểm: từ 0,25 đến 100, bước 0,25. Để trống thì lấy 1 điểm.',
    'Quy tắc chấm (chỉ Câu chọn nhiều): "Tỷ lệ" hoặc "Đúng hết". Để trống thì lấy "Tỷ lệ".',
    `Tags: cách nhau bằng dấu phẩy, tối đa ${TAGS_MAX} tag, mỗi tag tối đa ${TAG_MAX_CHARS} ký tự.`,
    'Công thức toán: viết LaTeX giữa hai dấu đô la, ví dụ $x^2 + 1$. Muốn in dấu đô la thật thì viết \\$. Không dùng $$...$$.',
    'Ảnh không nhập qua Excel: thêm khi sửa Câu hỏi.',
    `Tối đa ${MAX_IMPORT_ROWS} dòng và ${MAX_UPLOAD_BYTES / 1024 / 1024} MB mỗi file. Nhận file .xlsx hoặc .csv (UTF-8).`,
    'Ví dụ: Giá trị của $2^3$ là? | 6 | 8 | 9 | | | | B | 1 | | số học',
    'Ví dụ: Chọn các số nguyên tố | 2 | 4 | 7 | 9 | | | A,C | 2 | Tỷ lệ | số học, lớp 6',
  ];
  for (const line of lines) guide.addRow([line]);
  guide.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
