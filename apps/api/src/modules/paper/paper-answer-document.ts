import { coverTable } from './cover';
import { type DocxContent, packDocx } from './docx-package';
import { MediaRegistry } from './media';
import type { AnswerRow, AnswerSpec } from './paper-answer-spec';
import type { PaperDocument } from './paper-document';
import { isCodeBlock, paragraphRuns, paragraphStyleOf } from './rich-text';
import { STYLE } from './styles';
import { mmToTwips, paragraph, run, table } from './wordml';

// Tệp "Đáp án và thang điểm" (docs/plan/xuat-bo-de-thiet-ke.md mục 4.1): cùng đầu trang, chân trang và khung thông tin gọn như
// tệp Đề, rồi bảng đáp án theo từng Phần, tổng điểm và hướng dẫn chấm của các câu tự luận. Không in nội dung câu hỏi.

const TEXT_WIDTH = mmToTwips(193);
const COLUMNS = [mmToTwips(18), mmToTwips(52), mmToTwips(20)] as const;
const METHOD_WIDTH = TEXT_WIDTH - COLUMNS[0] - COLUMNS[1] - COLUMNS[2];
const WIDTHS = [...COLUMNS, METHOD_WIDTH];
const CORRECTED = ' (đã đính chính)';

const cell = (text: string, width: number, bold = false) => ({
  widthTwips: width,
  content: paragraph(text ? run(text, { bold }) : ''),
});

const answerTable = (rows: AnswerRow[]) =>
  table(
    [
      ['Câu', 'Đáp án', 'Điểm', 'Cách chấm'].map((label, i) =>
        cell(label, WIDTHS[i] as number, true),
      ),
      ...rows.map((row) =>
        [
          String(row.number),
          `${row.answer}${row.corrected ? CORRECTED : ''}`,
          row.points,
          row.method,
        ].map((text, i) => cell(text, WIDTHS[i] as number)),
      ),
    ],
    WIDTHS,
  );

export async function buildAnswerDocument(spec: AnswerSpec): Promise<PaperDocument> {
  const warnings: string[] = [];
  const media = await MediaRegistry.from(undefined);
  const sections = spec.sections
    .map(
      (section) =>
        (section.title ? paragraph(run(section.title), '', STYLE.section) : '') +
        answerTable(section.rows),
    )
    .join(paragraph(''));
  const guides =
    spec.guides.length === 0
      ? ''
      : paragraph(run('Hướng dẫn chấm'), '', STYLE.section) +
        spec.guides
          .map(({ number, rubric }) => {
            const parts = paragraphRuns(rubric, {
              warn: (message) => warnings.push(`Câu ${number}: ${message}`),
              image: (id, alt) => media.drawing(id, alt),
            });
            const label = run(`Câu ${number}: `, { bold: true });
            // Hướng dẫn mở đầu bằng khối mã thì nhãn đứng một mình để khối mã giữ kiểu đoạn của nó.
            const alone = parts[0] !== undefined && isCodeBlock(parts[0]);
            return (
              (alone ? paragraph(label) : '') +
              parts
                .map((runs, index) =>
                  paragraph(
                    index === 0 && !alone ? label + runs : runs,
                    '',
                    paragraphStyleOf(runs),
                  ),
                )
                .join('')
            );
          })
          .join('');

  const bodyXml =
    paragraph(run('ĐÁP ÁN VÀ THANG ĐIỂM'), '<w:jc w:val="center"/>', STYLE.title) +
    coverTable(spec.heading, spec.examCode, false) +
    paragraph('') +
    sections +
    paragraph(run(`Tổng điểm: ${spec.totalPoints}`, { bold: true })) +
    paragraph(
      run(`Điểm quy về thang 10 theo tổng điểm của Bộ đề (tổng ${spec.totalPoints} điểm).`),
      '',
      STYLE.note,
    ) +
    guides;
  const content: DocxContent = {
    bodyXml,
    school: spec.school,
    unit: spec.unit,
    examCode: spec.examCode,
    media,
  };
  return { bytes: await packDocx(content), warnings };
}
