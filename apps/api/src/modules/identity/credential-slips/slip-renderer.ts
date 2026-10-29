import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export const SLIP_RENDERER = Symbol('SLIP_RENDERER');

/** Một phiếu: thông tin để phát cho Người dự thi, kèm mật khẩu tạm. */
export interface SlipEntry {
  fullName: string;
  code: string | null;
  classLabel: string | null;
  username: string;
  temporaryPassword: string;
}

/** Một dòng trong file Excel tra cứu (không có mật khẩu). */
export interface SlipListRow {
  fullName: string;
  code: string | null;
  classLabel: string | null;
  username: string | null;
  outcome: 'created' | 'tag_added';
}

export interface SlipInput {
  entries: SlipEntry[];
  listRows: SlipListRow[];
  /** Địa chỉ trang đăng nhập, in thành mã QR trên mỗi phiếu. */
  loginUrl: string;
  /** Hạn của mật khẩu tạm, in trên phiếu. */
  expiresAt: Date;
}

export interface SlipFiles {
  pdf: Buffer;
  xlsx: Buffer;
}

/** Cổng dựng file phiếu; bản thật dùng pdfkit, test thay bằng bản ghi lại dữ liệu để kiểm tra mật khẩu. */
export interface SlipRenderer {
  render(input: SlipInput): Promise<SlipFiles>;
}

// Phiếu Q50: A4, 8 phiếu mỗi trang (2 cột × 4 hàng) để cắt phát tại lớp.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 28;
const COLUMNS = 2;
const ROWS = 4;
const PER_PAGE = COLUMNS * ROWS;
const CELL = {
  width: (PAGE.width - 2 * MARGIN) / COLUMNS,
  height: (PAGE.height - 2 * MARGIN) / ROWS,
};
const PADDING = 12;
const QR_SIZE = 64;

// Từ dist/modules/identity/credential-slips hoặc src/... : cùng độ sâu, lên 4 cấp là apps/api.
const fontPath = (name: string) =>
  path.resolve(__dirname, '../../../../assets/fonts', `BeVietnamPro-${name}.ttf`);

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(
    date,
  );

export class PdfKitSlipRenderer implements SlipRenderer {
  async render(input: SlipInput): Promise<SlipFiles> {
    const [pdf, xlsx] = await Promise.all([this.renderPdf(input), this.renderXlsx(input)]);
    return { pdf, xlsx };
  }

  private async renderPdf({ entries, loginUrl, expiresAt }: SlipInput): Promise<Buffer> {
    const qr = await QRCode.toBuffer(loginUrl, { width: 256, margin: 1 });
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
      info: { Title: 'Phiếu tài khoản' },
    });
    doc.registerFont('regular', fontPath('Regular'));
    doc.registerFont('bold', fontPath('Bold'));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    entries.forEach((entry, index) => {
      const slot = index % PER_PAGE;
      if (slot === 0) doc.addPage({ size: 'A4', margin: 0 });
      const x = MARGIN + (slot % COLUMNS) * CELL.width;
      const y = MARGIN + Math.floor(slot / COLUMNS) * CELL.height;
      this.drawSlip(doc, entry, { x, y }, qr, loginUrl, expiresAt);
    });
    doc.end();
    return done;
  }

  private drawSlip(
    doc: PDFKit.PDFDocument,
    entry: SlipEntry,
    origin: { x: number; y: number },
    qr: Buffer,
    loginUrl: string,
    expiresAt: Date,
  ) {
    const { x, y } = origin;
    doc
      .save()
      .dash(3, { space: 3 })
      .lineWidth(0.5)
      .strokeColor('#888888')
      .rect(x, y, CELL.width, CELL.height)
      .stroke()
      .undash()
      .restore();

    const left = x + PADDING;
    const textWidth = CELL.width - 2 * PADDING;
    doc.fillColor('#000000');
    doc
      .font('bold')
      .fontSize(9)
      .text('PHIẾU TÀI KHOẢN', left, y + PADDING, { width: textWidth });
    doc
      .font('bold')
      .fontSize(12)
      .text(entry.fullName, left, y + PADDING + 16, {
        width: textWidth,
        ellipsis: true,
        height: 16,
      });
    const meta = [entry.code && `Mã: ${entry.code}`, entry.classLabel && `Lớp: ${entry.classLabel}`]
      .filter(Boolean)
      .join('   ');
    doc
      .font('regular')
      .fontSize(9)
      .text(meta, left, y + PADDING + 36, { width: textWidth, ellipsis: true, height: 12 });
    doc
      .font('regular')
      .fontSize(10)
      .text(`Tên đăng nhập: ${entry.username}`, left, y + PADDING + 56, { width: textWidth });
    doc
      .font('regular')
      .fontSize(10)
      .text('Mật khẩu tạm:', left, y + PADDING + 74);
    doc
      .font('bold')
      .fontSize(15)
      .text(entry.temporaryPassword, left, y + PADDING + 88, { width: textWidth });
    doc
      .font('regular')
      .fontSize(8)
      .text(
        `Hãy đổi mật khẩu ở lần đăng nhập đầu tiên. Mật khẩu tạm hết hạn ${formatDate(expiresAt)}.`,
        left,
        y + PADDING + 116,
        { width: textWidth - QR_SIZE - 8 },
      );
    doc.image(qr, x + CELL.width - PADDING - QR_SIZE, y + CELL.height - PADDING - QR_SIZE - 12, {
      width: QR_SIZE,
      height: QR_SIZE,
    });
    doc
      .font('regular')
      .fontSize(6.5)
      .text(loginUrl, x + CELL.width - PADDING - QR_SIZE - 40, y + CELL.height - PADDING - 8, {
        width: QR_SIZE + 40,
        align: 'right',
        lineBreak: false,
      });
  }

  private async renderXlsx({ listRows }: SlipInput): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Danh sách');
    sheet.columns = [
      { header: 'STT', key: 'index', width: 6 },
      { header: 'Họ tên', key: 'fullName', width: 28 },
      { header: 'Mã định danh', key: 'code', width: 18 },
      { header: 'Lớp', key: 'classLabel', width: 16 },
      { header: 'Tên đăng nhập', key: 'username', width: 20 },
      { header: 'Kết quả', key: 'outcome', width: 26 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const [i, row] of listRows.entries()) {
      sheet.addRow({
        index: i + 1,
        fullName: row.fullName,
        code: row.code ?? '',
        classLabel: row.classLabel ?? '',
        username: row.username ?? '',
        outcome: row.outcome === 'created' ? 'Đã tạo tài khoản' : 'Đã có tài khoản, thêm vai trò',
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
