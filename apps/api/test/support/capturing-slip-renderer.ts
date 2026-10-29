import type {
  SlipFiles,
  SlipInput,
  SlipRenderer,
} from '../../src/modules/identity/credential-slips/slip-renderer';

export const FAKE_PDF = Buffer.from('%PDF-1.7 phiếu giả cho test');
export const FAKE_XLSX = Buffer.from('xlsx giả cho test');

/**
 * Thay bộ dựng PDF thật trong test: ghi lại dữ liệu từng phiếu (kể cả mật khẩu) để test kiểm tra mật khẩu
 * có dùng được, mà không phải đọc ngược file PDF. Bộ dựng thật có unit test riêng.
 */
export class CapturingSlipRenderer implements SlipRenderer {
  readonly calls: SlipInput[] = [];
  failNext = false;

  async render(input: SlipInput): Promise<SlipFiles> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Không dựng được PDF');
    }
    this.calls.push(input);
    return { pdf: FAKE_PDF, xlsx: FAKE_XLSX };
  }

  /** Mọi phiếu đã dựng, theo thứ tự. */
  get entries() {
    return this.calls.flatMap((call) => call.entries);
  }
}
