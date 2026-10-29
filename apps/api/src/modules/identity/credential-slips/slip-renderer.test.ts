import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { PdfKitSlipRenderer, type SlipEntry } from './slip-renderer';

const entry = (i: number): SlipEntry => ({
  fullName: `Nguyễn Văn Số ${i}`,
  code: `B21${String(i).padStart(5, '0')}`,
  classLabel: 'CNTT-K21',
  username: `b21${String(i).padStart(5, '0')}`,
  temporaryPassword: `Mk${i}xyzabcde`,
});

const pageCount = (pdf: Buffer) =>
  (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;
const expiresAt = new Date('2026-11-09T08:00:00Z');
const loginUrl = 'https://thi.example.edu.vn/login';

describe('PdfKitSlipRenderer', () => {
  const renderer = new PdfKitSlipRenderer();

  it('PDF A4, 8 phiếu mỗi trang (Q50)', async () => {
    const eight = await renderer.render({
      entries: Array.from({ length: 8 }, (_, i) => entry(i)),
      listRows: [],
      loginUrl,
      expiresAt,
    });
    expect(eight.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(eight.pdf)).toBe(1);
    expect(eight.pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');

    const nine = await renderer.render({
      entries: Array.from({ length: 9 }, (_, i) => entry(i)),
      listRows: [],
      loginUrl,
      expiresAt,
    });
    expect(pageCount(nine.pdf)).toBe(2);
    const seventeen = await renderer.render({
      entries: Array.from({ length: 17 }, (_, i) => entry(i)),
      listRows: [],
      loginUrl,
      expiresAt,
    });
    expect(pageCount(seventeen.pdf)).toBe(3);
  });

  it('Excel tra cứu không chứa mật khẩu', async () => {
    const entries = [entry(1), entry(2)];
    const { xlsx } = await renderer.render({
      entries,
      listRows: [
        {
          fullName: entries[0]?.fullName ?? '',
          code: entries[0]?.code ?? null,
          classLabel: 'CNTT-K21',
          username: entries[0]?.username ?? null,
          outcome: 'created',
        },
        {
          fullName: 'Trần Thị Có Sẵn',
          code: 'B1',
          classLabel: null,
          username: null,
          outcome: 'tag_added',
        },
      ],
      loginUrl,
      expiresAt,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const cells: string[] = [];
    sheet?.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value))));
    expect(cells).toContain('Nguyễn Văn Số 1');
    expect(cells).toContain('Trần Thị Có Sẵn');
    for (const e of entries) expect(cells).not.toContain(e.temporaryPassword);
    expect(JSON.stringify(cells)).not.toContain('Mk1xyz');
  });
});
