import { textWidthMm } from './text-width';

/** Một hàng (mỗi Phương án một cột), hai Phương án mỗi hàng, hoặc mỗi Phương án một dòng. */
export type OptionLayout = 'row' | 'columns' | 'lines';

const FONT_SIZE_PT = 12;
const TEXT_WIDTH_MM = 193;
/**
 * Khoảng đệm giữa các cột. Đo từ đề mẫu của Trường (50 câu, 9 một hàng, 7 hai cột, 34 mỗi dòng):
 * khoảng đệm hợp lệ nằm trong 10,9 đến 15,9 mm; lấy 13 mm, giữa khoảng đó.
 */
const COLUMN_GAP_MM = 13;

const labelOf = (index: number) => `${String.fromCharCode(65 + index)}. `;

/** Cách xếp bốn (hoặc n) Phương án theo độ rộng của Phương án dài nhất, tính cả nhãn "A. " in đậm. */
export function optionLayoutOf(texts: string[]): OptionLayout {
  const widest = Math.max(
    0,
    ...texts.map(
      (text, index) =>
        textWidthMm(labelOf(index), FONT_SIZE_PT, { bold: true }) + textWidthMm(text, FONT_SIZE_PT),
    ),
  );
  if (widest <= TEXT_WIDTH_MM / texts.length - COLUMN_GAP_MM) return 'row';
  if (widest <= TEXT_WIDTH_MM / 2 - COLUMN_GAP_MM) return 'columns';
  return 'lines';
}
