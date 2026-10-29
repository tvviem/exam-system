import ExcelJS from 'exceljs';
import { z } from 'zod';
import { stripAccents } from './person-name';

/** Giới hạn của Yêu cầu cấp tài khoản (Q88). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 2000;

export type FileErrorCode = 'unsupported_file' | 'missing_columns' | 'empty_file' | 'too_many_rows';

/** Lỗi của cả file (khác lỗi từng dòng): yêu cầu chuyển sang `parse_failed`. */
export class AccountRequestFileError extends Error {
  constructor(readonly code: FileErrorCode) {
    super(code);
  }
}

export type RowErrorCode =
  | 'missing_full_name'
  | 'missing_code_and_email'
  | 'field_too_long'
  | 'invalid_email'
  | 'invalid_date_of_birth'
  | 'invalid_gender'
  | 'duplicate_in_file';

export type ParsedGender = 'male' | 'female' | 'other';

export interface ParsedRow {
  /** Số dòng trong file (dòng tiêu đề là dòng 1). */
  rowNumber: number;
  fullName: string | null;
  code: string | null;
  email: string | null;
  classLabel: string | null;
  /** yyyy-mm-dd */
  dateOfBirth: string | null;
  gender: ParsedGender | null;
  error: RowErrorCode | null;
}

export interface ParsedFile {
  rows: ParsedRow[];
}

type Field = 'fullName' | 'code' | 'email' | 'classLabel' | 'dateOfBirth' | 'gender';
type Cell = string | Date;

const HEADERS: Record<string, Field> = {
  'ho ten': 'fullName',
  'ma dinh danh': 'code',
  email: 'email',
  lop: 'classLabel',
  'ngay sinh': 'dateOfBirth',
  'gioi tinh': 'gender',
};

const MAX_LENGTH: Partial<Record<Field, number>> = {
  fullName: 200,
  code: 50,
  email: 320,
  classLabel: 50,
};

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

export async function parseAccountRequestFile(buffer: Buffer): Promise<ParsedFile> {
  const kind = sniffUpload(buffer);
  if (!kind) throw new AccountRequestFileError('unsupported_file');
  const table = kind === 'xlsx' ? await readXlsx(buffer) : readCsv(buffer);
  return { rows: validateRows(table) };
}

// --- đọc file thành bảng ô -------------------------------------------------------------------

interface Table {
  header: Cell[];
  /** `rowNumber` là số dòng thật trong file. */
  records: { rowNumber: number; cells: Cell[] }[];
}

async function readXlsx(buffer: Buffer): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AccountRequestFileError('unsupported_file');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AccountRequestFileError('empty_file');
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
    if (cells.some(isFilled) && records.length <= MAX_ROWS) records.push({ rowNumber, cells });
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

const isFilled = (cell: Cell) => cell instanceof Date || cell !== '';

// --- kiểm tra từng dòng ----------------------------------------------------------------------

function validateRows(table: Table): ParsedRow[] {
  const columns = new Map<Field, number>();
  table.header.forEach((title, index) => {
    const key = stripAccents(String(title instanceof Date ? '' : title))
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const field = HEADERS[key];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  if (!columns.has('fullName')) throw new AccountRequestFileError('missing_columns');

  const records = table.records.filter((r) => r.cells.some(isFilled));
  if (records.length === 0) throw new AccountRequestFileError('empty_file');
  if (records.length > MAX_ROWS) throw new AccountRequestFileError('too_many_rows');

  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  return records.map(({ rowNumber, cells }) => {
    const get = (field: Field): Cell => {
      const index = columns.get(field);
      return index === undefined ? '' : (cells[index] ?? '');
    };
    const text = (field: Field) => {
      const value = get(field);
      return value instanceof Date ? '' : value;
    };

    const dob = parseDateOfBirth(get('dateOfBirth'));
    const gender = parseGender(text('gender'));
    const row: ParsedRow = {
      rowNumber,
      fullName: text('fullName') || null,
      code: text('code') || null,
      email: text('email') || null,
      classLabel: text('classLabel') || null,
      dateOfBirth: dob === 'invalid' ? null : dob,
      gender: gender === 'invalid' ? null : gender,
      error: null,
    };
    row.error = rowError(row, dob === 'invalid', gender === 'invalid', seenCodes, seenEmails);
    if (!row.error) {
      if (row.code) seenCodes.add(row.code.toLowerCase());
      if (row.email) seenEmails.add(row.email.toLowerCase());
    }
    return row;
  });
}

function rowError(
  row: ParsedRow,
  badDate: boolean,
  badGender: boolean,
  seenCodes: Set<string>,
  seenEmails: Set<string>,
): RowErrorCode | null {
  if (!row.fullName) return 'missing_full_name';
  if (!row.code && !row.email) return 'missing_code_and_email';
  for (const field of ['fullName', 'code', 'email', 'classLabel'] as const) {
    const limit = MAX_LENGTH[field];
    if (limit && (row[field]?.length ?? 0) > limit) return 'field_too_long';
  }
  if (row.email && !z.email().safeParse(row.email).success) return 'invalid_email';
  if (badDate) return 'invalid_date_of_birth';
  if (badGender) return 'invalid_gender';
  if (
    (row.code && seenCodes.has(row.code.toLowerCase())) ||
    (row.email && seenEmails.has(row.email.toLowerCase()))
  ) {
    return 'duplicate_in_file';
  }
  return null;
}

function parseGender(text: string): ParsedGender | null | 'invalid' {
  if (text === '') return null;
  const key = stripAccents(text).trim();
  if (key === 'nam') return 'male';
  if (key === 'nu') return 'female';
  if (key === 'khac') return 'other';
  return 'invalid';
}

/** dd/mm/yyyy hoặc yyyy-mm-dd (hoặc ô ngày của Excel) → yyyy-mm-dd; ngày không có thật là 'invalid'. */
function parseDateOfBirth(value: Cell): string | null | 'invalid' {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === '') return null;
  const match =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'invalid';
  const [year, month, day] = value.includes('/')
    ? [Number(match[3]), Number(match[2]), Number(match[1])]
    : [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && year >= 1900 ? date.toISOString().slice(0, 10) : 'invalid';
}
