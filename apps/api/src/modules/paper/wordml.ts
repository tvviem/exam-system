/** Mảnh WordprocessingML dựng tay. Chỉ dùng bên trong module `paper`. */

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
export const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
export const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const mmToTwips = (mm: number) => Math.round((mm * 1440) / 25.4);

export const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const xml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;

export interface RunStyle {
  /** Mã kiểu ký tự (`w:rStyle`). */
  style?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Chỉ số trên hoặc dưới. */
  vertAlign?: 'superscript' | 'subscript';
  color?: string;
  /** Cỡ chữ theo pt. */
  size?: number;
}

export const run = (text: string, style: RunStyle = {}) => {
  const props =
    (style.style ? `<w:rStyle w:val="${style.style}"/>` : '') +
    (style.bold ? '<w:b/>' : '') +
    (style.italic ? '<w:i/>' : '') +
    (style.underline ? '<w:u w:val="single"/>' : '') +
    (style.vertAlign ? `<w:vertAlign w:val="${style.vertAlign}"/>` : '') +
    (style.color ? `<w:color w:val="${style.color}"/>` : '') +
    (style.size ? `<w:sz w:val="${style.size * 2}"/>` : '');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};

export const paragraph = (runs: string, props = '', style?: string) => {
  const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + props;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
};

export interface Cell {
  /** Các đoạn (`w:p`) trong ô. */
  content: string;
  widthTwips: number;
}

const BORDERS = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
  .join('')}</w:tblBorders>`;

/** Bảng có đường viền đơn; mỗi hàng là danh sách ô. */
export const table = (rows: Cell[][], columnWidths: number[]) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${columnWidths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${BORDERS}` +
  `<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${columnWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
  rows
    .map(
      (cells) =>
        `<w:tr>${cells.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${c.widthTwips}" w:type="dxa"/></w:tcPr>${c.content}</w:tc>`).join('')}</w:tr>`,
    )
    .join('') +
  '</w:tbl>';

export const lineBreak = '<w:r><w:br/></w:r>';
