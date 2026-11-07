import type { ResultBand } from '@exam/shared';

// Tô màu Kết quả theo mức đạt (PR 5c, thiết kế lại ở Q318): bốn dải đi từ cảnh báo (đỏ) qua hổ phách và màu chủ đạo đến xanh lá.
// Số điểm luôn dùng chữ `fg` trên nền thẻ trung tính nên đủ tương phản ở cả chế độ sáng và tối; màu của dải chỉ nằm ở vạch trên
// thẻ, nét vòng điểm và nhãn mức đạt (mỗi cặp nền/chữ nằm trong `tokens.test.ts`). Không chỉ dựa vào màu: mỗi dải có biểu tượng
// và lời nhận xét riêng.

export interface BandStyle {
  /** Vạch màu trên cùng của thẻ điểm. */
  accent: string;
  /** Màu nét của vòng điểm. */
  stroke: string;
  /** Nhãn mức đạt (nền và chữ cùng một cặp token). */
  pill: string;
}

export const BAND_STYLE: Record<ResultBand, BandStyle> = {
  low: {
    accent: 'border-t-danger',
    stroke: 'stroke-danger',
    pill: 'bg-danger-soft text-danger',
  },
  fair: {
    accent: 'border-t-warning',
    stroke: 'stroke-warning',
    pill: 'bg-warning-soft text-warning',
  },
  good: {
    accent: 'border-t-primary',
    stroke: 'stroke-primary',
    pill: 'bg-primary-soft text-on-primary-soft',
  },
  excellent: {
    accent: 'border-t-success',
    stroke: 'stroke-success',
    pill: 'bg-success text-on-success',
  },
};
