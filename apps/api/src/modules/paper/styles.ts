import { W, xml } from './wordml';

/** Mã kiểu (`w:styleId`) mà bộ dựng gắn vào đoạn và lượt chữ. Tên hiển thị tiếng Việt nằm trong `STYLES`. */
export const STYLE = {
  title: 'TieuDeDeThi',
  section: 'TieuDePhan',
  question: 'CauHoi',
  option: 'PhuongAn',
  note: 'GhiChu',
  signature: 'ChuKy',
  label: 'NhanCau',
  codeBlock: 'KhoiMa',
  codeText: 'ChuKhoiMa',
  inlineCode: 'MaTrongDong',
} as const;

const FONT = 'Times New Roman';
export const CODE_FONT = 'Courier New';
export const CODE_SIZE_PT = 10.5;

const CODE_RUN =
  `<w:rFonts w:ascii="${CODE_FONT}" w:hAnsi="${CODE_FONT}" w:cs="${CODE_FONT}" w:eastAsia="${CODE_FONT}"/>` +
  `<w:sz w:val="${CODE_SIZE_PT * 2}"/><w:szCs w:val="${CODE_SIZE_PT * 2}"/>`;
/** Khối mã: viền bốn cạnh, thụt vào bằng Phương án, không giãn dòng. */
const CODE_BOX = `<w:keepLines/><w:pBdr>${['top', 'left', 'bottom', 'right']
  .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="4" w:color="808080"/>`)
  .join('')}</w:pBdr><w:spacing w:before="40" w:after="40"/><w:ind w:left="397" w:right="113"/>`;

const characterStyle = (id: string, name: string, runProps: string) =>
  `<w:style w:type="character" w:styleId="${id}"><w:name w:val="${name}"/><w:qFormat/><w:rPr>${runProps}</w:rPr></w:style>`;

const paragraphStyle = (id: string, name: string, runProps: string, paraProps = '') =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
  `${paraProps ? `<w:pPr>${paraProps}</w:pPr>` : ''}<w:rPr>${runProps}</w:rPr></w:style>`;

/**
 * Kiểu có tên của Word: Người ra đề đổi phông, cỡ chữ hay màu ở một kiểu là cả tệp đổi theo.
 * Số đo theo đề mẫu của Trường (mục 3.2): chữ 12 pt, tiêu đề 13 pt đậm, ghi chú 11 pt nghiêng, chữ ký 10 pt nghiêng.
 */
export const stylesXml = () =>
  xml(
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>` +
      `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="vi-VN"/>` +
      `</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
      paragraphStyle(
        STYLE.title,
        'Tiêu đề đề thi',
        '<w:b/><w:sz w:val="26"/><w:szCs w:val="26"/>',
      ) +
      paragraphStyle(
        STYLE.section,
        'Tiêu đề Phần',
        '<w:b/>',
        '<w:keepNext/><w:spacing w:before="120"/>',
      ) +
      paragraphStyle(STYLE.question, 'Câu hỏi', '', '<w:keepNext/><w:spacing w:before="60"/>') +
      paragraphStyle(STYLE.option, 'Phương án', '', '<w:ind w:left="284"/>') +
      paragraphStyle(STYLE.note, 'Ghi chú', '<w:i/><w:sz w:val="22"/><w:szCs w:val="22"/>') +
      paragraphStyle(STYLE.signature, 'Chữ ký', '<w:i/><w:sz w:val="20"/><w:szCs w:val="20"/>') +
      paragraphStyle(STYLE.codeBlock, 'Khối mã', CODE_RUN, CODE_BOX) +
      characterStyle(STYLE.codeText, 'Chữ khối mã', CODE_RUN) +
      characterStyle(STYLE.inlineCode, 'Mã trong dòng', CODE_RUN) +
      characterStyle(STYLE.label, 'Nhãn câu', '<w:b/><w:color w:val="0000FF"/>') +
      '</w:styles>',
  );
