import { CODE_SIZE_PT } from './styles';
import { textWidthMm } from './text-width';

/** Một mẩu chữ của Phương án; `code` là in bằng phông đơn cách. */
export interface TextSegment {
  text: string;
  code?: boolean;
}

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

/** Courier New: mọi ký tự rộng 0,6 cỡ chữ. */
const codeWidthMm = (text: string) => [...text].length * 0.6 * CODE_SIZE_PT * (25.4 / 72);

const widthMm = (option: string | TextSegment[]) =>
  typeof option === 'string'
    ? textWidthMm(option, FONT_SIZE_PT)
    : option.reduce(
        (sum, part) =>
          sum + (part.code ? codeWidthMm(part.text) : textWidthMm(part.text, FONT_SIZE_PT)),
        0,
      );

/** Cách xếp bốn (hoặc n) Phương án theo độ rộng của Phương án dài nhất, tính cả nhãn "A. " in đậm. */
export function optionLayoutOf(texts: (string | TextSegment[])[]): OptionLayout {
  const widest = Math.max(
    0,
    ...texts.map(
      (text, index) => textWidthMm(labelOf(index), FONT_SIZE_PT, { bold: true }) + widthMm(text),
    ),
  );
  if (widest <= TEXT_WIDTH_MM / texts.length - COLUMN_GAP_MM) return 'row';
  if (widest <= TEXT_WIDTH_MM / 2 - COLUMN_GAP_MM) return 'columns';
  return 'lines';
}
