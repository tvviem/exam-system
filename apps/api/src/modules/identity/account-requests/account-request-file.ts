import { z } from 'zod';
import {
  type Cell,
  isFilled,
  readTable,
  SpreadsheetError,
  type Table,
} from '../../../common/spreadsheet';
import { stripAccents } from './person-name';

/** Giới hạn số dòng của Yêu cầu cấp tài khoản (Q88). */
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

export async function parseAccountRequestFile(buffer: Buffer): Promise<ParsedFile> {
  try {
    return { rows: validateRows(await readTable(buffer, MAX_ROWS)) };
  } catch (error) {
    if (error instanceof SpreadsheetError) throw new AccountRequestFileError(error.code);
    throw error;
  }
}

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
