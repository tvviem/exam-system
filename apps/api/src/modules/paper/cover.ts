import { STYLE } from './styles';
import { mmToTwips, paragraph, run, table } from './wordml';

export interface PaperHeading {
  /** Tiêu đề kỳ thi, in hoa ở góc khung ("THI KẾT THÚC HỌC PHẦN"). */
  title: string;
  /** Tên Bộ đề, một dòng nhỏ dưới tiêu đề. */
  examName: string;
  course: string;
  /** Ngày thi đã định dạng. */
  date: string;
  /** Hình thức thi ("Trắc nghiệm"). */
  form: string;
  /** Thời gian đã định dạng ("60 phút"). */
  duration: string;
}

const DOTS = '......................';

const lines = (...paragraphs: string[]) => paragraphs.join('');
const plain = (text: string, size = 12) => paragraph(run(text, { size }));

/** Khung thông tin trang đầu theo đề mẫu của Trường: bảng 3 cột, 2 hàng. */
export function coverTable(
  heading: PaperHeading,
  examCode: string,
  candidateFields: boolean,
): string {
  const widths = [
    Math.round(mmToTwips(193) * 0.4),
    Math.round(mmToTwips(193) * 0.42),
    mmToTwips(193) - Math.round(mmToTwips(193) * 0.4) - Math.round(mmToTwips(193) * 0.42),
  ] as const;
  const [w1, w2, w3] = widths;
  const info = lines(
    paragraph(run(heading.title), '', STYLE.title),
    paragraph(run(heading.examName), '', STYLE.note),
    plain(`Học phần: ${heading.course}`),
    plain(`Ngày thi: ${heading.date}`),
    plain(`Hình thức thi: ${heading.form}`),
    plain(`Thời gian: ${heading.duration}`),
  );
  if (!candidateFields)
    return table([[{ widthTwips: mmToTwips(193), content: info }]], [mmToTwips(193)]);
  return table(
    [
      [
        {
          widthTwips: w1,
          content: info,
        },
        {
          widthTwips: w2,
          content: lines(
            plain(`Mã SV: ${DOTS}`),
            plain(`Họ và tên: ${DOTS}`),
            plain(`Lớp: ........  Mã đề: ${examCode}`),
          ),
        },
        { widthTwips: w3, content: paragraph(run('Điểm số', { bold: true, size: 11 })) },
      ],
      [
        {
          widthTwips: w1,
          content: paragraph(run('Cán bộ coi thi 1 (Chữ ký, họ tên)'), '', STYLE.signature),
        },
        {
          widthTwips: w2,
          content: paragraph(run('Cán bộ coi thi 2 (Chữ ký, họ tên)'), '', STYLE.signature),
        },
        { widthTwips: w3, content: paragraph(run('Điểm chữ', { bold: true, size: 11 })) },
      ],
    ],
    [w1, w2, w3],
  );
}

export const endMarker = () =>
  paragraph(run('----------- HẾT ----------', { bold: true }), '<w:jc w:val="center"/>');

/** Quốc hiệu và Tiêu ngữ, canh giữa, đặt trước khung thông tin. */
export const nationalHeader = () =>
  paragraph(
    run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 13 }),
    '<w:jc w:val="center"/>',
  ) + paragraph(run('Độc lập - Tự do - Hạnh phúc', { bold: true }), '<w:jc w:val="center"/>');
