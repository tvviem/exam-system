import { type PaperBlocks, type PaperPreset, resolvePaperBlocks } from '@exam/shared';
import JSZip from 'jszip';
import { answerGrid } from './answer-grid';
import { coverTable, endMarker, nationalHeader, type PaperHeading } from './cover';
import { MediaRegistry, type PaperImage } from './media';
import { type PaperItem, renderItem } from './question-renderers';
import { paragraphRuns } from './rich-text';
import { STYLE, stylesXml } from './styles';
import { A, esc, M, mmToTwips, PIC, paragraph, R, run, W, WP, xml } from './wordml';

export type { PaperBlocks, PaperHeading, PaperImage, PaperItem, PaperPreset };

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
  /** Hướng dẫn chung của Bộ đề (văn bản có định dạng), in dưới khung thông tin bằng kiểu "Ghi chú". */
  instructions?: unknown;
  /** Bật tắt riêng từng khối, đè lên bộ cài sẵn. */
  blocks?: Partial<PaperBlocks>;
  /** Hình minh họa theo mã (`illustrationId`) mà nội dung câu tham chiếu; bên gọi đọc từ kho ảnh. */
  images?: Map<string, PaperImage>;
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

const sectionHeading = (
  section: PaperSection,
  warnings: string[],
  media: MediaRegistry,
): string => {
  const title = section.title ? paragraph(run(section.title), '', STYLE.section) : '';
  const instructions = section.instructions
    ? paragraphRuns(section.instructions, {
        warn: (message) => warnings.push(`Hướng dẫn của Phần: ${message}`),
        image: (id, alt) => media.drawing(id, alt),
      })
        .map((runs) => paragraph(runs, '', STYLE.note))
        .join('')
    : '';
  return title + instructions;
};

/** Hướng dẫn chung của Bộ đề: các đoạn "Ghi chú" (không có hoặc trống thì không in). */
const generalInstructions = (spec: PaperSpec, warnings: string[], media: MediaRegistry): string =>
  spec.instructions
    ? paragraphRuns(spec.instructions, {
        warn: (message) => warnings.push(`Hướng dẫn của Bộ đề: ${message}`),
        image: (id, alt) => media.drawing(id, alt),
      })
        .map((runs) => paragraph(runs, '', STYLE.note))
        .join('')
    : '';

const body = (spec: PaperSpec, warnings: string[], media: MediaRegistry) => {
  const guide = generalInstructions(spec, warnings, media);
  let number = 0;
  const questions = spec.sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          const rendered = renderItem(item, ++number, media);
          warnings.push(...rendered.warnings);
          return rendered.xml;
        })
        .join('');
      return sectionHeading(section, warnings, media) + items;
    })
    .join('');
  const items = spec.sections.flatMap((section) => section.items);
  const choiceCount = items.filter((item) => item.type === 'single_choice').length;
  const blocks = resolvePaperBlocks(spec.preset, spec.blocks);
  return (
    (blocks.nationalHeader ? nationalHeader() : '') +
    coverTable(spec.heading, spec.examCode, blocks.candidateFields) +
    guide +
    (blocks.grid ? answerGrid(choiceCount) : '') +
    questions +
    endMarker()
  );
};

const documentXml = (spec: PaperSpec, warnings: string[], media: MediaRegistry) =>
  xml(
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:m="${M}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${body(spec, warnings, media)}` +
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

export async function buildPaperDocument(spec: PaperSpec): Promise<PaperDocument> {
  const zip = new JSZip();
  const warnings: string[] = [];
  const registry = await MediaRegistry.from(spec.images);
  // dựng thân trước vì chỉ lúc đó mới biết hình nào được dùng
  const documentPart = documentXml(spec, warnings, registry);
  zip.file('[Content_Types].xml', contentTypes(registry.extensions));
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', documentPart);
  zip.file('word/_rels/document.xml.rels', documentRels(registry.media));
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/header1.xml', headerXml(spec.school));
  zip.file('word/footer1.xml', footerXml(spec.unit, spec.examCode));
  for (const media of registry.media) zip.file(`word/${media.target}`, media.bytes);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, warnings };
}
