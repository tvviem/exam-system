import { z } from 'zod';

// Xuất Bộ đề ra .docx (docs/plan/xuat-bo-de-thiet-ke.md): các khối bật tắt được, hai bộ cài sẵn và hình dạng yêu cầu gửi api.
// Máy chủ (dựng tệp) và giao diện (hộp thoại Xuất Bộ đề) dùng chung để hai bên không lệch nhau.

/** Các khối của bản xuất mà Người ra đề bật tắt được (mục 3.5 của thiết kế). */
export interface PaperBlocks {
  /** "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc" ở đầu trang 1 (khối tùy chọn, Q411). */
  nationalHeader: boolean;
  /** Mã SV, Họ và tên, Lớp, Điểm số, Điểm chữ, chữ ký cán bộ coi thi. */
  candidateFields: boolean;
  /** Lưới phiếu trả lời 17 cột. */
  grid: boolean;
}

export const PAPER_PRESETS = ['school', 'compact'] as const;
/** `school`: "Mẫu Trường" như đề giấy; `compact`: "Gọn" để lưu trữ. */
export type PaperPreset = (typeof PAPER_PRESETS)[number];

export const PAPER_PRESET_BLOCKS: Record<PaperPreset, PaperBlocks> = {
  school: { nationalHeader: false, candidateFields: true, grid: true },
  compact: { nationalHeader: false, candidateFields: false, grid: false },
};

/** Các khối sau khi công tắc riêng đè lên bộ cài sẵn (mặc định Mẫu Trường). */
export const resolvePaperBlocks = (
  preset: PaperPreset = 'school',
  overrides: Partial<PaperBlocks> = {},
): PaperBlocks => ({ ...PAPER_PRESET_BLOCKS[preset], ...overrides });

const text = (max: number) => z.string().trim().min(1).max(max);
const bool = z.boolean().optional();

export const PAPER_COURSE_MAX_CHARS = 150;

/** Yêu cầu xuất Đề thi: đúng một trong `sessionId` hoặc `examId`, kèm Học phần (không có trong dữ liệu, nhập mỗi lần xuất). */
export const paperExportRequestSchema = z
  .strictObject({
    sessionId: z.uuid().optional(),
    examId: z.uuid().optional(),
    course: text(PAPER_COURSE_MAX_CHARS),
    title: text(100).optional(),
    examCode: text(50).optional(),
    unit: text(150).optional(),
    preset: z.enum(PAPER_PRESETS).optional(),
    blocks: z.strictObject({ nationalHeader: bool, candidateFields: bool, grid: bool }).optional(),
  })
  .refine((body) => (body.sessionId === undefined) !== (body.examId === undefined), {
    message: 'Chọn đúng một trong sessionId hoặc examId',
  });

export type PaperExportRequest = z.infer<typeof paperExportRequestSchema>;
