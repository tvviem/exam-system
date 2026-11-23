import {
  PAPER_PRESET_BLOCKS,
  PAPER_PRESETS,
  type PaperAnswersRequest,
  type PaperBlocks,
  type PaperExportRequest,
  type PaperPreset,
  type PaperVariantsRequest,
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

/** Từ Phiên thi (nêu `variant` khi Phiên thi dùng chung nhiều Mã đề) hoặc từ Bộ đề. */
export type PaperSource =
  | { sessionId: string; variant?: number }
  | { sessionId: string; variants: 'all' }
  | { examId: string };

/** Nguồn của một tệp Đề hay Đáp án (không phải xuất tất cả Mã đề). */
export type SingleSource = Exclude<PaperSource, { variants: 'all' }>;

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
export function paperRequestOf(source: SingleSource, form: PaperForm): PaperExportRequest {
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

/** Yêu cầu xuất tệp Đáp án: nguồn, Học phần và các ô thông tin (không có Mẫu và công tắc), kèm xác nhận đã hiểu tệp chứa đáp án. */
export function paperAnswersRequestOf(source: SingleSource, form: PaperForm): PaperAnswersRequest {
  const { preset: _preset, blocks: _blocks, ...shared } = paperRequestOf(source, form);
  return { ...shared, confirm: true };
}

/**
 * Yêu cầu xuất **tất cả Mã đề** của một Phiên thi thành zip (Q473): như tệp Đề nhưng không có Mã đề nhập tay (mỗi Mã đề có nhãn riêng).
 * Kèm Đáp án (`answers`) thì phải xác nhận (`confirm`), vì tệp chứa Đáp án đúng.
 */
export function paperVariantsRequestOf(
  sessionId: string,
  form: PaperForm,
  answers: boolean,
): PaperVariantsRequest {
  const {
    examCode: _examCode,
    sessionId: _session,
    examId: _exam,
    ...rest
  } = paperRequestOf({ sessionId }, form) as PaperExportRequest & { examId?: string };
  return { ...rest, sessionId, ...(answers ? { answers: true, confirm: true as const } : {}) };
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

/** Gửi một yêu cầu xuất tệp; trả tệp và cảnh báo, lỗi thì ném `ApiError` như `apiFetch`. */
async function postForFile(
  url: string,
  body: unknown,
  fallbackName: string,
): Promise<ExportedPaper> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
    filename: filenameOfDisposition(res.headers.get('content-disposition')) ?? fallbackName,
    warnings: parsePaperWarnings(res.headers.get('x-paper-warnings')),
  };
}

/** Gọi `POST /api/paper/exam` (hay `/answers` khi có `confirm`): tệp Đề hoặc tệp Đáp án .docx. */
export function requestPaper(
  request: PaperExportRequest | PaperAnswersRequest,
): Promise<ExportedPaper> {
  // Có `confirm` là tệp Đáp án, không thì tệp Đề.
  return postForFile(
    'confirm' in request ? '/api/paper/answers' : '/api/paper/exam',
    request,
    'de-thi.docx',
  );
}

/** Gọi `POST /api/paper/variants`: tệp zip của mọi Mã đề (kèm Excel phân Mã đề). */
export const requestVariantsZip = (request: PaperVariantsRequest): Promise<ExportedPaper> =>
  postForFile('/api/paper/variants', request, 'ma-de.zip');

/** Gọi `POST /api/paper/assignment`: Excel phân Mã đề của Phiên thi. */
export const requestAssignment = (sessionId: string): Promise<ExportedPaper> =>
  postForFile('/api/paper/assignment', { sessionId }, 'phan-ma-de.xlsx');

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
