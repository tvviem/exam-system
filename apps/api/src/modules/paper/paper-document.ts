import { type PaperBlocks, type PaperPreset, resolvePaperBlocks } from '@exam/shared';
import { answerGrid } from './answer-grid';
import { coverTable, endMarker, nationalHeader, type PaperHeading } from './cover';
import { packDocx } from './docx-package';
import { MediaRegistry, type PaperImage } from './media';
import { type PaperItem, renderItem } from './question-renderers';
import { paragraphRuns, paragraphStyleOf } from './rich-text';
import { STYLE } from './styles';
import { paragraph, run } from './wordml';

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
        .map((runs) => paragraph(runs, '', paragraphStyleOf(runs, STYLE.note)))
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
        .map((runs) => paragraph(runs, '', paragraphStyleOf(runs, STYLE.note)))
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

export async function buildPaperDocument(spec: PaperSpec): Promise<PaperDocument> {
  const warnings: string[] = [];
  const media = await MediaRegistry.from(spec.images);
  const bodyXml = body(spec, warnings, media);
  const bytes = await packDocx({
    bodyXml,
    school: spec.school,
    unit: spec.unit,
    examCode: spec.examCode,
    media,
  });
  return { bytes, warnings };
}
