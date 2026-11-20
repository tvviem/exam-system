import JSZip from 'jszip';
import type { MediaRegistry } from './media';
import { stylesXml } from './styles';
import { A, esc, M, mmToTwips, PIC, R, W, WP, xml } from './wordml';

// Gói .docx dùng chung cho tệp Đề thi và tệp Đáp án: đầu trang, chân trang, kiểu, quan hệ, loại nội dung, hình nhúng.

const TEXT_WIDTH_TWIPS = mmToTwips(210 - 9 - 8);

const headerXml = (school: string) =>
  xml(
    `<w:hdr xmlns:w="${W}"><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr><w:jc w:val="right"/></w:pPr>` +
      `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${esc(school)}</w:t></w:r></w:p></w:hdr>`,
  );

const field = (instruction: string) =>
  `<w:fldSimple w:instr=" ${instruction} "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;

const footerXml = (unit: string, examCode: string) =>
  xml(
    `<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>` +
      `<w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH_TWIPS}"/></w:tabs></w:pPr>` +
      `<w:r><w:t xml:space="preserve">${esc(unit)}</w:t></w:r><w:r><w:tab/></w:r>` +
      `<w:r><w:t xml:space="preserve">Trang </w:t></w:r>${field('PAGE')}<w:r><w:t>/</w:t></w:r>${field('NUMPAGES')}` +
      `<w:r><w:t xml:space="preserve"> - Mã đề thi ${esc(examCode)}</w:t></w:r></w:p></w:ftr>`,
  );

const documentXml = (bodyXml: string) =>
  xml(
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:m="${M}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${bodyXml}` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="${mmToTwips(15)}" w:right="${mmToTwips(8)}" w:bottom="${mmToTwips(15)}" w:left="${mmToTwips(9)}" ` +
      `w:header="${mmToTwips(5)}" w:footer="${mmToTwips(10)}" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );

const contentTypes = (mediaExtensions: Set<string>) =>
  xml(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      [...mediaExtensions]
        .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext}"/>`)
        .join('') +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
      `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
  );

const ROOT_RELS = xml(
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
);

const documentRels = (media: { relationshipId: string; target: string }[]) =>
  xml(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdHeader" Type="${R}/header" Target="header1.xml"/>` +
      `<Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/>` +
      media
        .map(
          (m) => `<Relationship Id="${m.relationshipId}" Type="${R}/image" Target="${m.target}"/>`,
        )
        .join('') +
      `</Relationships>`,
  );

/** Nội dung của một tệp Word: thân tài liệu và thông tin in ở đầu và chân trang. */
export interface DocxContent {
  bodyXml: string;
  school: string;
  unit: string;
  examCode: string;
  media: MediaRegistry;
}

/** Đóng gói thành .docx. Phải gọi sau khi dựng `bodyXml` vì chỉ lúc đó `media` mới biết hình nào được dùng. */
export async function packDocx(content: DocxContent): Promise<Uint8Array> {
  const { bodyXml, school, unit, examCode, media } = content;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes(media.extensions));
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', documentXml(bodyXml));
  zip.file('word/_rels/document.xml.rels', documentRels(media.media));
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/header1.xml', headerXml(school));
  zip.file('word/footer1.xml', footerXml(unit, examCode));
  for (const item of media.media) zip.file(`word/${item.target}`, item.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
