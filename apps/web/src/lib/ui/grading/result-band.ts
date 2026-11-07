import type { ResultBand } from '@exam/shared';

// Tô màu Kết quả theo mức đạt (PR 5c): bốn dải trên bộ màu hiện tại của giao diện, đi từ cảnh báo (đỏ) qua hổ phách và màu
// chủ đạo đến xanh lá đậm nhất. Không chỉ dựa vào màu: mỗi dải có biểu tượng và lời nhận xét riêng.

export interface BandStyle {
  /** Nền và viền của khối điểm lớn. */
  hero: string;
  /** Màu nét của vòng điểm và thanh phần trăm (dùng cho `stroke`/`bg`). */
  stroke: string;
  track: string;
  /** Chữ phụ trong khối điểm. */
  muted: string;
}

export const BAND_STYLE: Record<ResultBand, BandStyle> = {
  low: {
    hero: 'border-danger/50 bg-danger-soft text-danger',
    stroke: 'stroke-danger',
    track: 'stroke-danger/20',
    muted: 'text-danger',
  },
  fair: {
    hero: 'border-warning/50 bg-warning-soft text-warning',
    stroke: 'stroke-warning',
    track: 'stroke-warning/20',
    muted: 'text-warning',
  },
  good: {
    hero: 'border-primary/40 bg-primary-soft text-on-primary-soft',
    stroke: 'stroke-primary',
    track: 'stroke-primary/20',
    muted: 'text-on-primary-soft',
  },
  excellent: {
    hero: 'border-success bg-success text-on-success',
    stroke: 'stroke-on-success',
    track: 'stroke-on-success/25',
    muted: 'text-on-success',
  },
};
