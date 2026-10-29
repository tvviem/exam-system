import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  AccountRequestFileError,
  type ParsedRow,
  parseAccountRequestFile,
  sniffUpload,
} from './account-request-file';

const HEADER = 'Họ tên,Mã định danh,Email,Lớp,Ngày sinh,Giới tính';
const csv = (...lines: string[]) => Buffer.from(lines.join('\n'), 'utf8');

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const fileError = async (buffer: Buffer) => {
  const error = await parseAccountRequestFile(buffer).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AccountRequestFileError);
  return (error as AccountRequestFileError).code;
};
const rowsOf = async (buffer: Buffer): Promise<ParsedRow[]> =>
  (await parseAccountRequestFile(buffer)).rows;

describe('file CSV', () => {
  it('đọc đủ sáu cột, đổi ngày dd/mm/yyyy và giới tính', async () => {
    const rows = await rowsOf(
      csv(HEADER, 'Nguyễn Văn An,B2103456,an@example.edu.vn,CNTT-K21,15/03/2005,Nam'),
    );
    expect(rows).toEqual([
      {
        rowNumber: 2,
        fullName: 'Nguyễn Văn An',
        code: 'B2103456',
        email: 'an@example.edu.vn',
        classLabel: 'CNTT-K21',
        dateOfBirth: '2005-03-15',
        gender: 'male',
        error: null,
      },
    ]);
  });

  it('chịu được BOM, CRLF, dấu chấm phẩy và trường có dấu ngoặc kép', async () => {
    const text = '﻿Họ tên;Mã định danh;Lớp\r\n"Trần, Thị Bình";B2103457;"K21 ""A"""\r\n';
    const [row] = await rowsOf(Buffer.from(text, 'utf8'));
    expect(row).toMatchObject({
      fullName: 'Trần, Thị Bình',
      code: 'B2103457',
      classLabel: 'K21 "A"',
    });
  });

  it('tên cột không phân biệt dấu và hoa thường; cột thiếu thì để trống', async () => {
    const [row] = await rowsOf(csv('HO TEN,ma dinh danh', 'Lê Văn C,B1'));
    expect(row).toMatchObject({ fullName: 'Lê Văn C', code: 'B1', email: null, classLabel: null });
  });

  it('bỏ dòng trống nhưng giữ đúng số dòng trong file', async () => {
    const rows = await rowsOf(csv(HEADER, 'A,B1,,,,', ',,,,,', 'C,B2,,,,'));
    expect(rows.map((r) => [r.rowNumber, r.fullName])).toEqual([
      [2, 'A'],
      [4, 'C'],
    ]);
  });

  it.each([
    ['Nữ', 'female'],
    ['nu', 'female'],
    ['KHÁC', 'other'],
    ['Nam', 'male'],
  ])('giới tính %s', async (text, expected) => {
    const [row] = await rowsOf(csv(HEADER, `A,B1,,,,${text}`));
    expect(row?.gender).toBe(expected);
  });
});

describe('file XLSX', () => {
  it('đọc chuỗi, số (mã dạng số) và ô ngày', async () => {
    const buffer = await xlsx([
      ['Họ tên', 'Mã định danh', 'Email', 'Lớp', 'Ngày sinh', 'Giới tính'],
      [
        'Nguyễn Văn An',
        2103456,
        'an@example.edu.vn',
        'K21',
        new Date(Date.UTC(2005, 2, 15)),
        'Nam',
      ],
    ]);
    const [row] = await rowsOf(buffer);
    expect(row).toMatchObject({
      rowNumber: 2,
      code: '2103456',
      dateOfBirth: '2005-03-15',
      gender: 'male',
      error: null,
    });
  });
});

describe('kiểm tra từng dòng (Q88)', () => {
  const errorsOf = async (...lines: string[]) =>
    (await rowsOf(csv(HEADER, ...lines))).map((r) => r.error);

  it('báo đúng mã lỗi cho từng loại dòng sai', async () => {
    expect(
      await errorsOf(
        ',B1,,,,', // thiếu họ tên
        'A,,,,,', // thiếu cả mã và email
        'B,B2,khong-phai-email,,,',
        'C,B3,,,31/02/2005,',
        'D,B4,,,2005-03-15,Không rõ',
        'E,B5,,,2005-03-15,Nam', // đúng, định dạng ngày yyyy-mm-dd cũng được
      ),
    ).toEqual([
      'missing_full_name',
      'missing_code_and_email',
      'invalid_email',
      'invalid_date_of_birth',
      'invalid_gender',
      null,
    ]);
  });

  it('dòng trùng mã hoặc email với dòng hợp lệ trước đó bị loại, không phân biệt hoa thường', async () => {
    expect(
      await errorsOf(
        'A,b2103456,a@example.edu.vn,,,',
        'B,B2103456,,,,',
        'C,,A@Example.edu.vn,,,',
        'D,B9,,,,',
      ),
    ).toEqual([null, 'duplicate_in_file', 'duplicate_in_file', null]);
  });
});

describe('lỗi cả file', () => {
  it('thiếu cột Họ tên', async () => {
    expect(await fileError(csv('Mã định danh,Email', 'B1,a@b.vn'))).toBe('missing_columns');
  });

  it('chỉ có dòng tiêu đề', async () => {
    expect(await fileError(csv(HEADER))).toBe('empty_file');
  });

  it('quá 2.000 dòng', async () => {
    const lines = Array.from({ length: 2001 }, (_, i) => `Người ${i},B${i},,,,`);
    expect(await fileError(csv(HEADER, ...lines))).toBe('too_many_rows');
    expect((await rowsOf(csv(HEADER, ...lines.slice(0, 2000)))).length).toBe(2000);
  });

  it('nội dung không phải xlsx hay csv', async () => {
    expect(await fileError(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 1, 2, 3]))).toBe(
      'unsupported_file',
    );
    expect(await fileError(Buffer.from('Họ tên\0Mã', 'utf8'))).toBe('unsupported_file');
    expect(await fileError(Buffer.from([0xff, 0xfe, 0xfd, 0x80]))).toBe('unsupported_file');
  });
});

describe('sniffUpload', () => {
  it('nhận ra loại file theo nội dung, không theo đuôi', async () => {
    expect(sniffUpload(await xlsx([['a']]))).toBe('xlsx');
    expect(sniffUpload(csv(HEADER))).toBe('csv');
    expect(sniffUpload(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]))).toBeNull(); // %PDF + NUL
    expect(sniffUpload(Buffer.alloc(0))).toBeNull();
  });
});
