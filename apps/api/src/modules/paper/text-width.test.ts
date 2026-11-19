import { describe, expect, it } from 'vitest';
import { textWidthMm } from './text-width';

// Giá trị mong đợi đo độc lập bằng PyMuPDF trên Liberation Serif (số đo tương thích Times New Roman).
describe('textWidthMm: độ rộng chữ Times New Roman', () => {
  it('chữ thường 12 pt, kể cả chữ Việt có dấu', () => {
    expect(textWidthMm('Hà Nội', 12)).toBeCloseTo(12.34, 1);
    expect(textWidthMm('Trường Đại học Bạc Liêu', 12)).toBeCloseTo(43.56, 1);
    expect(textWidthMm('12345', 12)).toBeCloseTo(10.58, 1);
  });

  it('tỉ lệ theo cỡ chữ', () => {
    expect(textWidthMm('Trường Đại học Bạc Liêu', 11)).toBeCloseTo(39.93, 1);
  });

  it('chữ đậm rộng hơn chữ thường', () => {
    expect(textWidthMm('A. ', 12, { bold: true })).toBeCloseTo(5.17, 1);
    expect(textWidthMm('Câu 1:', 12, { bold: true })).toBeCloseTo(12.11, 1);
  });

  it('chuỗi rỗng rộng 0, ký tự lạ không làm hỏng phép đo', () => {
    expect(textWidthMm('', 12)).toBe(0);
    expect(textWidthMm('Hà 😀 Nội', 12)).toBeGreaterThan(textWidthMm('Hà  Nội', 12));
  });
});
