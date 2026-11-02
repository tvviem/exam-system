#!/usr/bin/env node
// Sinh lại các file Excel dữ liệu demo vào thư mục demo-data/ ở gốc dự án, rồi đọc lại bằng chính bộ đọc của hệ thống.
//   pnpm -C apps/api build && pnpm -C apps/api demo:data
// Khung file lấy từ file mẫu của hệ thống (đúng tên sheet, tiêu đề, ô chọn quy tắc chấm). Thoát mã 1 nếu có dòng lỗi.
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { buildQuestionImportTemplate } = require('../dist/modules/question-bank/imports/question-import-template.js');
const { parseQuestionImportFile } = require('../dist/modules/question-bank/imports/question-import-file.js');
const { buildAccountRequestTemplate } = require('../dist/modules/identity/account-requests/account-request-template.js');
const { parseAccountRequestFile } = require('../dist/modules/identity/account-requests/account-request-file.js');

const OUT = path.resolve(__dirname, '../../../demo-data');

const QUESTION_FILES = [
  { file: 'cau-hoi-tin-hoc-can-ban.xlsx', rows: require('./demo-data/cau-hoi-tin-hoc-can-ban.cjs') },
  { file: 'cau-hoi-kien-truc-phan-mem.xlsx', rows: require('./demo-data/cau-hoi-kien-truc-phan-mem.cjs') },
];

// Họ tên, Mã định danh, Email, Lớp, Ngày sinh, Giới tính. Mã định danh làm tên đăng nhập.
const CANDIDATES = [
  ['Nguyễn Minh Anh', 'SV26001', '', 'CNTT-K26', '12/04/2007', 'Nữ'],
  ['Trần Quốc Bảo', 'SV26002', 'bao.tq@example.edu.vn', 'CNTT-K26', '03/09/2007', 'Nam'],
  ['Lê Thị Cẩm Chi', 'SV26003', '', 'CNTT-K26', '25/01/2008', 'Nữ'],
  ['Phạm Hoàng Dũng', 'SV26004', '', 'CNTT-K26', '', 'Nam'],
  ['Đặng Thu Hà', 'SV26005', 'ha.dt@example.edu.vn', 'CNTT-K26', '18/11/2007', 'Nữ'],
];

async function buildQuestionFile({ file, rows }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildQuestionImportTemplate());
  for (const [sheetName, list] of Object.entries(rows)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) throw new Error(`Mẫu không có sheet "${sheetName}"`);
    const columnOf = new Map();
    sheet.getRow(1).eachCell((cell, col) => columnOf.set(String(cell.value), col));
    list.forEach((row, index) => {
      // Dòng 2 trở đi đã tồn tại (ô chọn quy tắc chấm), nên đặt giá trị ô, không addRow.
      const target = sheet.getRow(index + 2);
      for (const [title, value] of Object.entries(row)) {
        const col = columnOf.get(title);
        if (!col) throw new Error(`Sheet "${sheetName}" không có cột "${title}"`);
        if (value !== '') target.getCell(col).value = value;
      }
      target.alignment = { vertical: 'top', wrapText: true };
      target.commit();
    });
  }
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  fs.writeFileSync(path.join(OUT, file), buffer);
  return { file, buffer };
}

async function buildCandidateFile() {
  const file = 'danh-sach-nguoi-du-thi.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildAccountRequestTemplate());
  const sheet = workbook.getWorksheet('Danh sách');
  CANDIDATES.forEach((person, index) => {
    const row = sheet.getRow(index + 2);
    person.forEach((value, col) => {
      const cell = row.getCell(col + 1);
      if (value !== '') cell.value = value;
      cell.numFmt = col === 1 || col === 4 ? '@' : 'General';
    });
    row.commit();
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  fs.writeFileSync(path.join(OUT, file), buffer);
  return { file, buffer };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let failed = false;
  const report = (line) => console.log(line);

  for (const spec of QUESTION_FILES) {
    const { file, buffer } = await buildQuestionFile(spec);
    const { rows } = await parseQuestionImportFile(buffer);
    const counts = {};
    for (const row of rows) {
      if (row.error) {
        failed = true;
        report(`LỖI ${file} (${row.type}, dòng ${row.rowNumber}): ${row.error}`);
      } else {
        counts[row.type] = (counts[row.type] ?? 0) + 1;
      }
    }
    report(`${file}: ${rows.length} dòng đọc được ${JSON.stringify(counts)}`);
  }

  const { file, buffer } = await buildCandidateFile();
  const parsed = await parseAccountRequestFile(buffer);
  const bad = parsed.rows.filter((row) => row.error);
  for (const row of bad) report(`LỖI ${file} (dòng ${row.rowNumber}): ${row.error}`);
  if (bad.length > 0) failed = true;
  report(`${file}: ${parsed.rows.length} dòng đọc được`);

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
