import {
  ITEM_MAX_CHARS,
  POINTS_MAX,
  POINTS_MIN,
  POINTS_STEP,
  STEM_MAX_CHARS,
  TAG_MAX_CHARS,
  TAGS_MAX,
} from '@exam/shared';
import ExcelJS from 'exceljs';
import { MAX_UPLOAD_BYTES } from '../../../common/spreadsheet';
import {
  DEFAULT_ESSAY_MAX_LENGTH,
  DEFAULT_POINTS,
  ESSAY_MAX_LENGTH_RANGE,
} from './question-import-cells';
import { MAX_IMPORT_ROWS, MAX_OPTIONS } from './question-import-file';

// File mẫu và file ví dụ Nhập Excel Câu hỏi (Q123, Q145, Q156, Q157). Tên sheet và tiêu đề cột phải khớp với bộ đọc;
// test đọc lại chính các file này để giữ hai bên đồng bộ.

const vnNumber = (n: number) => String(n).replace('.', ',');

interface Column {
  title: string;
  width: number;
  /** Ghi chú hiện khi rê chuột vào ô tiêu đề. */
  note: string;
}

type Row = Record<string, string>;

interface SheetDef {
  name: string;
  columns: Column[];
  /** Cột có danh sách chọn (Quy tắc chấm) và các giá trị của nó. */
  lists?: Record<string, string[]>;
  examples: Row[];
}

const letters = (first: 'A' | 'a') =>
  Array.from({ length: MAX_OPTIONS }, (_, i) => String.fromCharCode(first.charCodeAt(0) + i));

const content = (note: string): Column => ({ title: 'Nội dung', width: 52, note });
const points: Column = {
  title: 'Điểm',
  width: 9,
  note: `Từ ${vnNumber(POINTS_MIN)} đến ${POINTS_MAX}, bước ${vnNumber(POINTS_STEP)}. Để trống thì lấy ${DEFAULT_POINTS} điểm.`,
};
const tags: Column = {
  title: 'Tags',
  width: 26,
  note: `Cách nhau bằng dấu phẩy, tối đa ${TAGS_MAX} tag, mỗi tag tối đa ${TAG_MAX_CHARS} ký tự.`,
};
const choiceColumns = (kind: 'Phương án' | 'Mệnh đề', first: 'A' | 'a'): Column[] =>
  letters(first).map((letter, i) => ({
    title: `${kind} ${letter}`,
    width: kind === 'Phương án' ? 22 : 30,
    note:
      i === 0
        ? `Điền liên tục từ ${letter}, không để ô trống ở giữa. Công thức viết trong $...$.`
        : `Tối đa ${ITEM_MAX_CHARS} ký tự.`,
  }));

const SHEETS: SheetDef[] = [
  {
    name: 'Chọn một',
    columns: [
      content(
        'Phần dẫn của câu hỏi. Bắt buộc. Công thức viết trong $...$; Alt+Enter để xuống dòng.',
      ),
      ...choiceColumns('Phương án', 'A'),
      {
        title: 'Đáp án',
        width: 10,
        note: 'Đúng một chữ cái của Phương án đúng, ví dụ B.',
      },
      points,
      tags,
    ],
    examples: [
      {
        'Nội dung':
          'Một tập hợp có $n$ phần tử thì có bao nhiêu tập con (kể cả tập rỗng và chính nó)?',
        'Phương án A': '$n$',
        'Phương án B': '$2n$',
        'Phương án C': '$2^n$',
        'Phương án D': '$n^2$',
        'Đáp án': 'C',
        Điểm: '0,5',
        Tags: 'toán rời rạc, tập hợp',
      },
      {
        'Nội dung': 'Đơn vị nhỏ nhất dùng để đo lượng thông tin trong máy tính là gì?',
        'Phương án A': 'Byte',
        'Phương án B': 'Bit',
        'Phương án C': 'Kilobyte',
        'Phương án D': 'Pixel',
        'Đáp án': 'B',
        Điểm: '0,25',
        Tags: 'tin học căn bản, biểu diễn thông tin',
      },
    ],
  },
  {
    name: 'Chọn nhiều',
    columns: [
      content('Phần dẫn của câu hỏi. Bắt buộc.'),
      ...choiceColumns('Phương án', 'A'),
      {
        title: 'Đáp án',
        width: 12,
        note: 'Các chữ cái của Phương án đúng, cách nhau bằng dấu phẩy, ví dụ A,C. Một chữ cũng được.',
      },
      points,
      {
        title: 'Quy tắc chấm',
        width: 16,
        note: '"Tỷ lệ" (chọn đúng đến đâu được điểm đến đó) hoặc "Đúng hết". Để trống thì lấy Tỷ lệ.',
      },
      tags,
    ],
    lists: { 'Quy tắc chấm': ['Tỷ lệ', 'Đúng hết'] },
    examples: [
      {
        'Nội dung':
          'Những mệnh đề nào sau đây là hằng đúng (luôn đúng với mọi giá trị chân lý của $p$ và $q$)?',
        'Phương án A': '$p \\lor \\lnot p$',
        'Phương án B': '$p \\land \\lnot p$',
        'Phương án C': '$(p \\land q) \\to p$',
        'Phương án D': '$p \\to \\lnot p$',
        'Đáp án': 'A,C',
        Điểm: '1',
        'Quy tắc chấm': 'Tỷ lệ',
        Tags: 'toán rời rạc, logic mệnh đề',
      },
      {
        'Nội dung': 'Chọn các thiết bị thuộc nhóm thiết bị nhập (input) của máy tính:',
        'Phương án A': 'Bàn phím',
        'Phương án B': 'Màn hình',
        'Phương án C': 'Chuột',
        'Phương án D': 'Máy in',
        'Phương án E': 'Máy quét (scanner)',
        'Đáp án': 'A,C,E',
        Điểm: '1,5',
        'Quy tắc chấm': 'Đúng hết',
        Tags: 'tin học căn bản, phần cứng',
      },
    ],
  },
  {
    name: 'Chùm đúng sai',
    columns: [
      content('Phần dẫn chung của cả chùm. Bắt buộc.'),
      ...choiceColumns('Mệnh đề', 'a'),
      {
        title: 'Đáp án',
        width: 16,
        note: 'Đ (đúng) hoặc S (sai) cho từng Mệnh đề theo thứ tự a, b, c..., ví dụ Đ,S,Đ,S. Phải đủ một giá trị cho mỗi Mệnh đề.',
      },
      points,
      {
        title: 'Quy tắc chấm',
        width: 16,
        note: '"Tỷ lệ", "Đúng hết" hoặc "Bậc thang". Để trống thì lấy Tỷ lệ.',
      },
      {
        title: 'Bậc thang',
        width: 28,
        note: 'Chỉ khi Quy tắc chấm là Bậc thang: tỷ lệ điểm khi đúng 0, 1, 2... Mệnh đề, cách nhau bằng dấu chấm phẩy, ví dụ 0; 0,1; 0,25; 0,5; 1. Dài đúng (số Mệnh đề + 1), bắt đầu 0, kết thúc 1, không giảm.',
      },
      tags,
    ],
    lists: { 'Quy tắc chấm': ['Tỷ lệ', 'Đúng hết', 'Bậc thang'] },
    examples: [
      {
        'Nội dung': 'Cho đồ thị đơn vô hướng $G$ có $5$ đỉnh và $7$ cạnh. Xét các nhận định sau:',
        'Mệnh đề a': 'Tổng bậc của các đỉnh trong $G$ bằng $14$.',
        'Mệnh đề b': 'Tổng bậc của các đỉnh trong $G$ bằng $7$.',
        'Mệnh đề c': 'Mỗi đỉnh của $G$ có bậc tối đa là $4$.',
        'Mệnh đề d': 'Một đồ thị đơn có $5$ đỉnh có thể có $20$ cạnh.',
        'Đáp án': 'Đ,S,Đ,S',
        Điểm: '1',
        'Quy tắc chấm': 'Bậc thang',
        'Bậc thang': '0; 0,1; 0,25; 0,5; 1',
        Tags: 'toán rời rạc, đồ thị',
      },
      {
        'Nội dung': 'Về hệ điều hành và quản lý tệp, xét các nhận định sau:',
        'Mệnh đề a': 'Windows và Linux đều là hệ điều hành.',
        'Mệnh đề b': 'Phần mở rộng .docx là của tệp bảng tính Excel.',
        'Mệnh đề c': 'Một thư mục có thể chứa các thư mục con.',
        'Đáp án': 'Đ,S,Đ',
        Điểm: '1',
        'Quy tắc chấm': 'Tỷ lệ',
        Tags: 'tin học căn bản, hệ điều hành',
      },
    ],
  },
  {
    name: 'Tự luận',
    columns: [
      content('Đề bài. Bắt buộc.'),
      {
        title: 'Độ dài tối đa',
        width: 14,
        note: `Số ký tự tối đa của bài làm, từ ${ESSAY_MAX_LENGTH_RANGE.min} đến ${ESSAY_MAX_LENGTH_RANGE.max}. Để trống thì lấy ${DEFAULT_ESSAY_MAX_LENGTH}.`,
      },
      {
        title: 'Hướng dẫn chấm',
        width: 52,
        note: 'Chỉ người chấm thấy, không hiện cho Người dự thi. Tùy chọn.',
      },
      points,
      tags,
    ],
    examples: [
      {
        'Nội dung':
          'Chứng minh bằng quy nạp toán học: với mọi số nguyên dương $n$, $1 + 2 + \\cdots + n = \\frac{n(n+1)}{2}$.',
        'Độ dài tối đa': '1500',
        'Hướng dẫn chấm':
          'Bước cơ sở ($n = 1$): 0,5 điểm.\nGiả thiết quy nạp: 0,5 điểm.\nBước quy nạp và kết luận: 1 điểm.',
        Điểm: '2',
        Tags: 'toán rời rạc, quy nạp',
      },
      {
        'Nội dung':
          'Trình bày sự khác nhau giữa bộ nhớ RAM và bộ nhớ ROM (nêu ít nhất 3 điểm khác nhau).',
        'Độ dài tối đa': '1000',
        'Hướng dẫn chấm':
          'Mỗi ý đúng 0,5 điểm, tối đa 1,5 điểm: tính khả biến khi mất điện; khả năng ghi dữ liệu; vai trò (dữ liệu đang xử lý so với chương trình khởi động).',
        Điểm: '1,5',
        Tags: 'tin học căn bản, bộ nhớ',
      },
    ],
  },
];

/** Tên sheet và tiêu đề cột của mẫu, để test so với bộ đọc. */
export const IMPORT_SHEET_HEADERS = Object.fromEntries(
  SHEETS.map((sheet) => [sheet.name, sheet.columns.map((c) => c.title)]),
);

/** File mẫu trống: dòng tiêu đề của bốn sheet và sheet "Hướng dẫn". */
export const buildQuestionImportTemplate = () => buildWorkbook(false);

/** File ví dụ: cùng bố cục, mỗi sheet hai Câu hỏi mẫu, đọc nhập được nguyên vẹn. */
export const buildQuestionImportExample = () => buildWorkbook(true);

async function buildWorkbook(withExamples: boolean): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addGuide(workbook, withExamples);
  for (const def of SHEETS) {
    const sheet = workbook.addWorksheet(def.name);
    sheet.columns = def.columns.map((c) => ({ header: c.title, key: c.title, width: c.width }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2F1' } };
      cell.note = def.columns[col - 1]?.note ?? '';
    });
    // Ô Đáp án và Bậc thang là chữ: Excel không đổi "1,5" hay "0; 0,1" thành số hoặc ngày.
    for (const title of ['Đáp án', 'Bậc thang']) {
      if (def.columns.some((c) => c.title === title)) sheet.getColumn(title).numFmt = '@';
    }
    if (withExamples) {
      for (const example of def.examples) {
        const row = sheet.addRow(def.columns.map((c) => example[c.title] ?? ''));
        row.alignment = { vertical: 'top', wrapText: true };
      }
    }
    // Sau các dòng ví dụ: ô có danh sách chọn làm dòng đó "tồn tại", thêm trước thì ví dụ nối đuôi ở dòng 502.
    for (const [title, values] of Object.entries(def.lists ?? {})) {
      const col = def.columns.findIndex((c) => c.title === title) + 1;
      const letter = sheet.getColumn(col).letter;
      for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
        sheet.getCell(`${letter}${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${values.join(',')}"`],
        };
      }
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addGuide(workbook: ExcelJS.Workbook, withExamples: boolean) {
  const guide = workbook.addWorksheet('Hướng dẫn');
  guide.getColumn(1).width = 24;
  guide.getColumn(2).width = 110;
  const heading = (text: string) => {
    const row = guide.addRow([text]);
    row.font = { bold: true, size: 12 };
    guide.addRow([]);
  };
  const line = (label: string, text: string) => {
    const row = guide.addRow([label, text]);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(1).font = { bold: true };
  };

  const title = guide.addRow(['Hướng dẫn nhập câu hỏi bằng Excel']);
  title.font = { bold: true, size: 14 };
  guide.addRow([]);

  heading('Cách làm');
  line(
    '1. Chọn sheet',
    'Tên sheet quyết định Loại câu hỏi: Chọn một, Chọn nhiều, Chùm đúng sai, Tự luận.',
  );
  line(
    '2. Điền câu hỏi',
    'Mỗi câu một dòng, từ dòng 2. Chỉ điền sheet nào cần; sheet không dùng để trống hoặc xóa đi đều được. Không đổi tên sheet và không thêm sheet khác (trừ sheet "Hướng dẫn" này, hệ thống bỏ qua).',
  );
  line(
    '3. Tải lên',
    'Chọn Chủ đề, tải file lên, xem trước từng dòng rồi mới bấm Tạo. Dòng lỗi được báo lý do và không được tạo.',
  );
  if (withExamples) {
    line(
      'Lưu ý',
      'File này có sẵn 8 câu ví dụ để thử. Khi soạn đề thật, hãy tải "File mẫu trống" để không nhập nhầm câu ví dụ.',
    );
  }
  guide.addRow([]);

  heading('Quy tắc chung cho mọi sheet');
  line('Nội dung', `Bắt buộc, tối đa ${STEM_MAX_CHARS} ký tự. Alt+Enter để xuống dòng trong ô.`);
  line(
    'Điểm',
    `Từ ${vnNumber(POINTS_MIN)} đến ${POINTS_MAX}, bước ${vnNumber(POINTS_STEP)} (ví dụ 0,25 hoặc 1,5). Để trống thì lấy ${DEFAULT_POINTS} điểm.`,
  );
  line(
    'Tags',
    `Cách nhau bằng dấu phẩy, tối đa ${TAGS_MAX} tag, mỗi tag tối đa ${TAG_MAX_CHARS} ký tự.`,
  );
  line(
    'Công thức toán',
    'Viết LaTeX giữa hai dấu đô la, ví dụ $x^2 + 1$ hoặc $\\frac{a}{b}$. Muốn in dấu đô la thật thì viết \\$. Không dùng $$...$$.',
  );
  line('Ảnh', 'Không nhập qua Excel: thêm khi sửa Câu hỏi sau khi nhập.');
  line(
    'Giới hạn',
    `Tối đa ${MAX_IMPORT_ROWS} dòng cho cả file, ${MAX_UPLOAD_BYTES / 1024 / 1024} MB, định dạng .xlsx.`,
  );
  guide.addRow([]);

  for (const def of SHEETS) {
    heading(`Sheet "${def.name}"`);
    for (const column of def.columns) line(column.title, column.note);
    guide.addRow([]);
  }

  heading('Lỗi thường gặp');
  line(
    'Đáp án không khớp',
    'Ở sheet "Chọn một" chỉ được một chữ cái. Chữ cái phải thuộc Phương án đã điền.',
  );
  line(
    'Đáp án Đ/S sai',
    'Ở sheet "Chùm đúng sai", Đáp án phải có đúng một giá trị Đ hoặc S cho mỗi Mệnh đề đã điền, theo thứ tự a, b, c...',
  );
  line(
    'Điểm sai',
    `Điểm chỉ nhận số từ ${vnNumber(POINTS_MIN)} đến ${POINTS_MAX}, bước ${vnNumber(POINTS_STEP)}; không nhận dạng 1e1 hay 0x10.`,
  );
  line(
    'Độ dài tối đa sai',
    `Ở sheet "Tự luận", Độ dài tối đa là số nguyên từ ${ESSAY_MAX_LENGTH_RANGE.min} đến ${ESSAY_MAX_LENGTH_RANGE.max}.`,
  );
  line(
    'Công thức lỗi',
    'LaTeX phải dựng được và không dùng lệnh bị cấm (ví dụ \\href); mỗi câu tối đa 50 công thức. Nhớ đóng dấu $ ở cả hai đầu.',
  );
  line(
    'Ô trống ở giữa',
    'Phương án (hoặc Mệnh đề) phải điền liên tục từ đầu; chừa ô trống ở giữa sẽ báo lỗi, vì làm lệch chữ cái của Đáp án.',
  );
  line(
    'Bậc thang sai',
    'Phải dài (số Mệnh đề + 1), bắt đầu 0, kết thúc 1, không giảm, các số cách nhau bằng dấu chấm phẩy.',
  );
  line(
    'Sheet lạ',
    'Đổi tên sheet hoặc thêm sheet khác sẽ làm cả file bị từ chối kèm tên sheet gây lỗi.',
  );
}
