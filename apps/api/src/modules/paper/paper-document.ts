import JSZip from 'jszip';
import { answerGrid } from './answer-grid';
import { type PaperBlocks, type PaperPreset, resolveBlocks } from './blocks';
import { coverTable, endMarker, nationalHeader, type PaperHeading } from './cover';
import { type PaperItem, renderItem } from './question-renderers';
import { paragraphRuns } from './rich-text';
import { STYLE, stylesXml } from './styles';
import { esc, mmToTwips, paragraph, R, run, W, xml } from './wordml';

export type { PaperBlocks, PaperHeading, PaperItem, PaperPreset };

/** Dữ liệu thuần để dựng một bản xuất đề; không chứa gì của cơ sở dữ liệu hay của Nest. */
export interface PaperSpec {
  /** Tên trường, in ở đầu mỗi trang. */
  school: string;
  /** Tên Đơn vị của Người ra đề, in ở chân trang. */
  unit: string;
  /** Mã đề in ở chân trang ("đề chuẩn", "132"...). */
  examCode: string;
  heading: PaperHeading;
  /** Bộ cài sẵn các khối; mặc định `school` (Mẫu Trường). */
  preset?: PaperPreset;
  /** Bật tắt riêng từng khối, đè lên bộ cài sẵn. */
  blocks?: Partial<PaperBlocks>;
  sections: PaperSection[];
}

export interface PaperSection {
  title: string | null;
  /** Hướng dẫn của Phần (văn bản có định dạng), in dưới tiêu đề Phần. */
  instructions?: unknown;
  items: PaperItem[];
}

export interface PaperDocument {
  bytes: Uint8Array;
  warnings: string[];
}

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

const sectionHeading = (section: PaperSection, warnings: string[]): string => {
  const title = section.title ? paragraph(run(section.title), '', STYLE.section) : '';
  const instructions = section.instructions
    ? paragraphRuns(section.instructions, (message) =>
        warnings.push(`Hướng dẫn của Phần: ${message}`),
      )
        .map((runs) => paragraph(runs, '', STYLE.note))
        .join('')
    : '';
  return title + instructions;
};

const body = (spec: PaperSpec, warnings: string[]) => {
  let number = 0;
  const questions = spec.sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          const rendered = renderItem(item, ++number);
          warnings.push(...rendered.warnings);
          return rendered.xml;
        })
        .join('');
      return sectionHeading(section, warnings) + items;
    })
    .join('');
  const items = spec.sections.flatMap((section) => section.items);
  const choiceCount = items.filter((item) => item.type === 'single_choice').length;
  const blocks = resolveBlocks(spec.preset, spec.blocks);
  return (
    (blocks.nationalHeader ? nationalHeader() : '') +
    coverTable(spec.heading, spec.examCode, blocks.candidateFields) +
    (blocks.grid ? answerGrid(choiceCount) : '') +
    questions +
    endMarker()
  );
};

const documentXml = (spec: PaperSpec, warnings: string[]) =>
  xml(
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body(spec, warnings)}` +
      `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="${mmToTwips(15)}" w:right="${mmToTwips(8)}" w:bottom="${mmToTwips(15)}" w:left="${mmToTwips(9)}" ` +
      `w:header="${mmToTwips(5)}" w:footer="${mmToTwips(10)}" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );

const CONTENT_TYPES = xml(
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`,
);

const ROOT_RELS = xml(
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
);

const DOCUMENT_RELS = xml(
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdStyles" Type="${R}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rIdHeader" Type="${R}/header" Target="header1.xml"/>` +
    `<Relationship Id="rIdFooter" Type="${R}/footer" Target="footer1.xml"/></Relationships>`,
);

export async function buildPaperDocument(spec: PaperSpec): Promise<PaperDocument> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  const warnings: string[] = [];
  zip.file('word/document.xml', documentXml(spec, warnings));
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS);
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/header1.xml', headerXml(spec.school));
  zip.file('word/footer1.xml', footerXml(spec.unit, spec.examCode));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, warnings };
}
