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
} as const;

const FONT = 'Times New Roman';

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
      `<w:style w:type="character" w:styleId="${STYLE.label}"><w:name w:val="Nhãn câu"/><w:qFormat/>` +
      `<w:rPr><w:b/><w:color w:val="0000FF"/></w:rPr></w:style></w:styles>`,
  );
