import {
  PAPER_PRESET_BLOCKS,
  PAPER_PRESETS,
  type PaperBlocks,
  type PaperExportRequest,
  type PaperPreset,
} from '@exam/shared';
import { ApiError } from './api';

// Hộp thoại "Xuất Bộ đề ra Word" (docs/plan/xuat-bo-de-thiet-ke.md mục 4 và 14): dựng yêu cầu gửi api, đọc cảnh báo, nhớ lần nhập gần nhất.

export interface PaperForm {
  course: string;
  title: string;
  examCode: string;
  unit: string;
  preset: PaperPreset;
  blocks: PaperBlocks;
}

export type PaperSource = { sessionId: string } | { examId: string };

export const emptyPaperForm = (): PaperForm => ({
  course: '',
  title: '',
  examCode: '',
  unit: '',
  preset: 'school',
  blocks: { ...PAPER_PRESET_BLOCKS.school },
});

/** Đổi Mẫu thì ba công tắc về mặc định của Mẫu mới; các ô khác giữ nguyên. */
export const selectPreset = (form: PaperForm, preset: PaperPreset): PaperForm => ({
  ...form,
  preset,
  blocks: { ...PAPER_PRESET_BLOCKS[preset] },
});

const BLOCK_KEYS = ['nationalHeader', 'candidateFields', 'grid'] as const;

/** Yêu cầu gửi api: cắt khoảng trắng, bỏ ô tùy chọn để trống, chỉ gửi công tắc khác mặc định của Mẫu đang chọn. */
export function paperRequestOf(source: PaperSource, form: PaperForm): PaperExportRequest {
  const defaults = PAPER_PRESET_BLOCKS[form.preset];
  const changed: Partial<PaperBlocks> = {};
  for (const key of BLOCK_KEYS) {
    if (form.blocks[key] !== defaults[key]) changed[key] = form.blocks[key];
  }
  const optional = (value: string) => value.trim() || undefined;
  return {
    ...source,
    course: form.course.trim(),
    ...(optional(form.title) && { title: form.title.trim() }),
    ...(optional(form.examCode) && { examCode: form.examCode.trim() }),
    ...(optional(form.unit) && { unit: form.unit.trim() }),
    preset: form.preset,
    ...(Object.keys(changed).length > 0 && { blocks: changed }),
  };
}

/** Header `X-Paper-Warnings` (JSON mã hóa URL) thành danh sách; hỏng thì rỗng (tệp vẫn tải được). */
export function parsePaperWarnings(header: string | null): string[] {
  if (!header) return [];
  try {
    const value: unknown = JSON.parse(decodeURIComponent(header));
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
  } catch {
    return [];
  }
}

export const filenameOfDisposition = (header: string | null): string | null =>
  header?.match(/filename="([^"]+)"/)?.[1] ?? null;

// ---------- ghi nhớ lần nhập gần nhất ----------

const PREFS_KEY = 'exam:paper-export';

type PaperPrefs = Pick<PaperForm, 'course' | 'title' | 'preset' | 'blocks'>;
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): KeyValueStorage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Đọc lần nhập gần nhất; chưa có, hỏng hay kho bị chặn thì dùng mặc định (Mẫu Trường). */
export function loadPaperPrefs(storage: KeyValueStorage | null = browserStorage()): PaperPrefs {
  const defaults = emptyPaperForm();
  const fallback: PaperPrefs = {
    course: '',
    title: '',
    preset: defaults.preset,
    blocks: defaults.blocks,
  };
  try {
    const saved: unknown = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return fallback;
    const record = saved as Record<string, unknown>;
    const preset = PAPER_PRESETS.find((p) => p === record.preset) ?? fallback.preset;
    const savedBlocks = (record.blocks ?? {}) as Record<string, unknown>;
    const blocks = { ...PAPER_PRESET_BLOCKS[preset] };
    for (const key of BLOCK_KEYS) {
      if (typeof savedBlocks[key] === 'boolean') blocks[key] = savedBlocks[key];
    }
    return {
      course: typeof record.course === 'string' ? record.course : '',
      title: typeof record.title === 'string' ? record.title : '',
      preset,
      blocks,
    };
  } catch {
    return fallback;
  }
}

/** Nhớ Học phần, Tiêu đề kỳ thi, Mẫu và công tắc (không nhớ Mã đề và Đơn vị); kho bị chặn thì bỏ qua. */
export function savePaperPrefs(
  form: PaperForm,
  storage: KeyValueStorage | null = browserStorage(),
): void {
  const prefs: PaperPrefs = {
    course: form.course.trim(),
    title: form.title.trim(),
    preset: form.preset,
    blocks: form.blocks,
  };
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage bị chặn (cửa sổ riêng tư, tắt dữ liệu trang): bỏ qua, hộp thoại vẫn dùng được.
  }
}

// ---------- gọi api và tải tệp ----------

export interface ExportedPaper {
  blob: Blob;
  filename: string;
  warnings: string[];
}

/** Gọi `POST /api/paper/exam`; trả tệp và cảnh báo, lỗi thì ném `ApiError` như `apiFetch`. */
export async function requestPaper(request: PaperExportRequest): Promise<ExportedPaper> {
  const res = await fetch('/api/paper/exam', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const data = res.headers.get('content-type')?.includes('application/json')
      ? ((await res.json()) as { code?: string })
      : {};
    const { code = 'UNKNOWN', ...details } = data;
    throw new ApiError(res.status, code, details);
  }
  return {
    blob: await res.blob(),
    filename: filenameOfDisposition(res.headers.get('content-disposition')) ?? 'de-thi.docx',
    warnings: parsePaperWarnings(res.headers.get('x-paper-warnings')),
  };
}

/** Cho trình duyệt tải một tệp đã có trong bộ nhớ. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Trình duyệt cần một nhịp để bắt đầu tải trước khi thu hồi địa chỉ.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
