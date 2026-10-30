import ExcelJS from 'exceljs';

// Đọc file bảng tính tải lên (xlsx hoặc csv) thành bảng ô, dùng cho Yêu cầu cấp tài khoản (Q88) và Nhập Excel
// Câu hỏi (Q123). Phần kiểm tra từng dòng thuộc về từng nghiệp vụ.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type SpreadsheetErrorCode = 'unsupported_file' | 'empty_file';

export class SpreadsheetError extends Error {
  constructor(readonly code: SpreadsheetErrorCode) {
    super(code);
  }
}

export type Cell = string | Date;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1000;
const MAX_COLUMNS = 50;

/**
 * Đọc thư mục trung tâm của file zip (không giải nén): lấy tên các mục và tổng kích thước giải nén
 * khai báo. Trả null nếu cấu trúc zip không hợp lệ.
 */
function inspectZip(buffer: Buffer): { names: Set<string>; uncompressedBytes: number } | null {
  const END_SIGNATURE = 0x06054b50;
  const ENTRY_SIGNATURE = 0x02014b50;
  const searchFrom = Math.max(0, buffer.length - 22 - 0xffff);
  let end = -1;
  for (let i = buffer.length - 22; i >= searchFrom; i--) {
    if (buffer.readUInt32LE(i) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (entries > MAX_ZIP_ENTRIES) return null;

  const names = new Set<string>();
  let uncompressedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ENTRY_SIGNATURE) return null;
    uncompressedBytes += buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.add(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { names, uncompressedBytes };
}

/** Loại file theo nội dung thật, không tin đuôi file hay MIME do client gửi. */
export function sniffUpload(buffer: Buffer): 'xlsx' | 'csv' | null {
  if (buffer.length === 0) return null;
  if (ZIP_MAGIC.every((byte, i) => buffer[i] === byte)) {
    // xlsx phải là zip có xl/workbook.xml và không phình to khi giải nén (Q88).
    const zip = inspectZip(buffer);
    if (!zip?.names.has('xl/workbook.xml')) return null;
    return zip.uncompressedBytes > MAX_UNCOMPRESSED_BYTES ? null : 'xlsx';
  }
  if (buffer.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
  return 'csv';
}

/**
 * Đọc file thành bảng ô. Giữ tối đa `maxRecords + 1` dòng có dữ liệu để người gọi nhận ra file quá dài
 * mà không phải duyệt cả file.
 */
export async function readTable(buffer: Buffer, maxRecords: number): Promise<Table> {
  const kind = sniffUpload(buffer);
  if (!kind) throw new SpreadsheetError('unsupported_file');
  return kind === 'xlsx' ? readXlsx(buffer, maxRecords) : readCsv(buffer);
}

export interface Table {
  header: Cell[];
  /** `rowNumber` là số dòng thật trong file. */
  records: { rowNumber: number; cells: Cell[] }[];
}

async function readXlsx(buffer: Buffer, maxRecords: number): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError('unsupported_file');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetError('empty_file');
  const columns = Math.min(sheet.columnCount, MAX_COLUMNS);
  const cellsOf = (row: ExcelJS.Row) =>
    Array.from({ length: columns }, (_, i) => cellValue(row.getCell(i + 1).value));
  // eachRow chỉ đi qua các dòng có thật: ô nằm ở dòng 1.000.000 không làm ta duyệt cả triệu dòng trống.
  const records: Table['records'] = [];
  let header: Cell[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      header = cellsOf(row);
      return;
    }
    const cells = cellsOf(row);
    if (cells.some(isFilled) && records.length <= maxRecords) records.push({ rowNumber, cells });
  });
  return { header, records };
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('richText' in value)
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

/** CSV theo RFC 4180: dấu phân cách là `,` hoặc `;` (Excel tiếng Việt hay xuất `;`), BOM được bỏ. */
function readCsv(buffer: Buffer): Table {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';

  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      lines.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    lines.push(row);
  }
  const [header = [], ...rest] = lines;
  return {
    header: header.map((cell) => cell.trim()),
    records: rest.map((cells, i) => ({ rowNumber: i + 2, cells: cells.map((c) => c.trim()) })),
  };
}

const count = (text: string, char: string) => text.split(char).length - 1;

export const isFilled = (cell: Cell) => cell instanceof Date || cell !== '';
