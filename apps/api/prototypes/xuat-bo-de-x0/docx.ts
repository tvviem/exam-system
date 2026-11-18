// PROTOTYPE BỎ ĐI (PR X0). Tự dựng .docx (WordprocessingML) bằng JSZip, không dùng thư viện Word.
// Thử đúng các phần rủi ro của "Mẫu Trường" (docs/plan/xuat-bo-de-thiet-ke.md mục 3): đầu trang nghiêng canh phải có đường kẻ, chân trang có
// tab phải và trường PAGE/NUMPAGES, kiểu có tên, bảng có viền, hình nội tuyến, công thức OMML, chữ "Câu N:" đậm màu xanh.
import JSZip from 'jszip';

export const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const mm = (value: number) => Math.round(value * 56.7); // 1 mm = 56,7 twips
const PAGE_W = 11906; // A4
const PAGE_H = 16838;
const MARGIN_L = mm(9);
const MARGIN_R = mm(8);
const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;

// ---- khối con ----
export const run = (text: string, props = '') =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
export const para = (inner: string, style?: string, ppr = '') =>
  `<w:p>${style || ppr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${ppr}</w:pPr>` : ''}${inner}</w:p>`;
export const mathInline = (omml: string) => omml;
export const mathBlock = (omml: string) =>
  `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara>${omml}</m:oMathPara></w:p>`;
export const questionNo = (n: number) => run(`Câu ${n}: `, '<w:rStyle w:val="SoCau"/>');

export function cell(width: number, inner: string, borders = true) {
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (borders
      ? ''
      : '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>') +
    `</w:tcPr>${inner}</w:tc>`
  );
}
export const table = (rows: string[], borders = true) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/>${borders ? '<w:tblStyle w:val="TableGrid"/>' : ''}<w:tblLayout w:type="fixed"/></w:tblPr>` +
  `<w:tblGrid></w:tblGrid>${rows.map((r) => `<w:tr>${r}</w:tr>`).join('')}</w:tbl>`;

/** Hình nội tuyến; kích thước tính bằng mm. */
export function inlineImage(
  relId: string,
  id: number,
  widthMm: number,
  heightMm: number,
  alt: string,
) {
  const cx = Math.round(widthMm * 36000);
  const cy = Math.round(heightMm * 36000);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Hinh ${id}" descr="${esc(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="hinh-${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

// ---- các phần của tệp ----
const header = (school: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>` +
  `<w:p><w:pPr><w:pStyle w:val="Header"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr><w:jc w:val="right"/></w:pPr>` +
  run(school, '<w:i/>') +
  `</w:p></w:hdr>`;

const footer = (unit: string, examCode: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>` +
  `<w:p><w:pPr><w:pStyle w:val="Footer"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>` +
  `<w:tabs><w:tab w:val="clear" w:pos="4513"/><w:tab w:val="clear" w:pos="9026"/><w:tab w:val="right" w:pos="${TEXT_W}"/></w:tabs></w:pPr>` +
  run(unit) +
  `<w:r><w:tab/></w:r>` +
  run('Trang ') +
  `<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>` +
  run('/') +
  `<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>` +
  run(` - Mã đề thi ${examCode}`) +
  `</w:p></w:ftr>`;

const font =
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
const styles = () =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>` +
  `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="vi-VN" w:eastAsia="vi-VN" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="TieuDeDeThi"><w:name w:val="Tiêu đề đề thi"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="TieuDePhan"><w:name w:val="Tiêu đề Phần"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Cau"><w:name w:val="Câu hỏi"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="40"/></w:pPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="PhuongAn"><w:name w:val="Phương án"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="227"/></w:pPr></w:style>` +
  `<w:style w:type="character" w:styleId="SoCau"><w:name w:val="Số câu"/><w:qFormat/><w:rPr><w:b/><w:color w:val="0000FF"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
  `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:tblPr><w:tblBorders>` +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
    .join('') +
  `</w:tblBorders></w:tblPr></w:style></w:styles>`;

const settings = () =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS}>` +
  `<m:mathPr><m:mathFont m:val="Cambria Math"/><m:brkBin m:val="before"/><m:smallFrac m:val="0"/><m:dispDef/><m:defJc m:val="centerGroup"/></m:mathPr>` +
  `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

export interface DocParts {
  body: string;
  school: string;
  unit: string;
  examCode: string;
  imagePng: Uint8Array;
}

export async function buildDocx(parts: DocParts): Promise<Uint8Array> {
  const zip = new JSZip();
  const put = (name: string, data: string | Uint8Array) =>
    zip.file(name, data, { createFolders: false }); // không ghi mục thư mục: một số bộ đọc OPC khắt khe không thích
  put(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
  );
  put(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  put(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
      `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
      `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` +
      `<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/hinh1.png"/></Relationships>`,
  );
  put('word/styles.xml', styles());
  put('word/settings.xml', settings());
  put('word/header1.xml', header(parts.school));
  put('word/footer1.xml', footer(parts.unit, parts.examCode));
  put('word/media/hinh1.png', parts.imagePng);
  put(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${parts.body}` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>` +
      `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${mm(15)}" w:right="${MARGIN_R}" w:bottom="${mm(15)}" w:left="${MARGIN_L}" w:header="${mm(5.2)}" w:footer="${mm(10)}" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
