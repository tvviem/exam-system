// Tùy chọn hiển thị nội dung đề ("Aa", docs/ui-design.md 4.1), lưu ở localStorage `exam:prefs`. Giao diện sáng/tối dùng
// chung công tắc của cả ứng dụng (`exam:theme`), không lưu lại ở đây.

export const PREFS_KEY = 'exam:prefs';

export type ViewMode = 'auto' | 'one' | 'all';
export const FONT_SCALES = [100, 115, 130] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface Prefs {
  viewMode: ViewMode;
  fontScale: FontScale;
  /** Chữ có chân (Noto Serif) cho nội dung đề; tắt thì chữ không chân. */
  serif: boolean;
}

export const DEFAULT_PREFS: Prefs = { viewMode: 'auto', fontScale: 100, serif: true };

export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_PREFS;
    data = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_PREFS;
  }
  const fontScale = FONT_SCALES.find((scale) => scale === data.fontScale);
  return {
    viewMode:
      data.viewMode === 'one' || data.viewMode === 'all' || data.viewMode === 'auto'
        ? data.viewMode
        : DEFAULT_PREFS.viewMode,
    fontScale: fontScale ?? DEFAULT_PREFS.fontScale,
    serif: typeof data.serif === 'boolean' ? data.serif : DEFAULT_PREFS.serif,
  };
}

/** Điện thoại làm từng câu một; từ 900 px hiện cả đề (Q240). */
export const defaultViewMode = (width: number): 'one' | 'all' => (width >= 900 ? 'all' : 'one');
