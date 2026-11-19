import { STYLE } from './styles';
import { mmToTwips, paragraph, run, table } from './wordml';

const COLUMNS = 17;
const centered = '<w:jc w:val="center"/>';

const cell = (text: string, widthTwips: number) => ({
  widthTwips,
  content: paragraph(text ? run(text, { size: 11 }) : '', centered),
});

/** Phiếu trả lời của đề giấy: hàng số câu, bên dưới hàng ô trống; hết 17 cột thì xuống hàng. */
export function answerGrid(choiceCount: number): string {
  if (choiceCount === 0) return '';
  const width = Math.floor(mmToTwips(193) / COLUMNS);
  const rows = [];
  for (let start = 1; start <= choiceCount; start += COLUMNS) {
    const numbers = Array.from({ length: COLUMNS }, (_, i) => {
      const n = start + i;
      return cell(n <= choiceCount ? String(n) : '', width);
    });
    rows.push(
      numbers,
      numbers.map((c) => cell('', c.widthTwips)),
    );
  }
  return (
    paragraph(run(`PHẦN BÀI LÀM ${choiceCount} CÂU TRẮC NGHIỆM`, { bold: true }), centered) +
    paragraph(
      run('*Chọn phương án đúng nhất (A, B, C, D), rồi điền vào ô trống tương ứng bên dưới.'),
      '',
      STYLE.note,
    ) +
    table(rows, Array<number>(COLUMNS).fill(width))
  );
}
