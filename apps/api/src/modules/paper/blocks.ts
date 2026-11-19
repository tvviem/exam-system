/** Các khối của bản xuất mà Người ra đề bật tắt được (mục 3.5 của thiết kế). */
export interface PaperBlocks {
  /** "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc" ở đầu trang 1 (khối tùy chọn, Q411). */
  nationalHeader: boolean;
  /** Mã SV, Họ và tên, Lớp, Điểm số, Điểm chữ, chữ ký cán bộ coi thi. */
  candidateFields: boolean;
  /** Lưới phiếu trả lời 17 cột. */
  grid: boolean;
}

export type PaperPreset = 'school' | 'compact';

const PRESETS: Record<PaperPreset, PaperBlocks> = {
  school: { nationalHeader: false, candidateFields: true, grid: true },
  compact: { nationalHeader: false, candidateFields: false, grid: false },
};

export const resolveBlocks = (
  preset: PaperPreset = 'school',
  overrides: Partial<PaperBlocks> = {},
): PaperBlocks => ({ ...PRESETS[preset], ...overrides });
