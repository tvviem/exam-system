import type { QuestionType } from '@exam/shared';
import type { ImageSource } from './media';
import { optionLayoutOf } from './option-layout';
import {
  isDisplayMath,
  isImageRuns,
  paragraphRuns,
  plainText,
  type RichContext,
} from './rich-text';
import { STYLE } from './styles';
import { mmToTwips, paragraph, run } from './wordml';

export interface PaperItem {
  type: QuestionType;
  stem: unknown;
  payload: Record<string, unknown>;
}

export interface RenderedItem {
  xml: string;
  /** Những chỗ bản xuất không dựng được đủ nội dung câu này (mỗi loại một lần). */
  warnings: string[];
}

/** Bộ trình bày của một Loại: nhận câu, số câu và chỗ báo cảnh báo; trả các đoạn XML. */
type Renderer = (item: PaperItem, number: number, ctx: RichContext) => string;

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const TEXT_WIDTH_TWIPS = mmToTwips(193);

/** Đoạn của một khối văn bản: hình canh giữa, còn lại theo kiểu mặc định. */
const blockParagraph = (runs: string): string =>
  paragraph(runs, isImageRuns(runs) ? '<w:jc w:val="center"/>' : '');

const stemOf = (item: PaperItem, number: number, ctx: RichContext): string => {
  const parts = paragraphRuns(item.stem, ctx);
  // đoạn đầu là công thức riêng dòng thì "Câu N:" đứng một mình, công thức xuống đoạn kế
  const startsWithDisplay = parts[0] !== undefined && isDisplayMath(parts[0]);
  const first = startsWithDisplay ? '' : (parts[0] ?? '');
  const rest = startsWithDisplay ? parts : parts.slice(1);
  return (
    paragraph(
      run(`Câu ${number}:`, { style: STYLE.label }) + run(' ') + first,
      '',
      STYLE.question,
    ) + rest.map(blockParagraph).join('')
  );
};

const isBlockRuns = (runs: string | undefined): boolean =>
  runs !== undefined && (isDisplayMath(runs) || isImageRuns(runs));

const choice: Renderer = (item, number, ctx) => {
  const stem = stemOf(item, number, ctx);

  const options = (item.payload.options as { content: unknown }[]).map((option, index) => {
    const parts = paragraphRuns(option.content, ctx);
    // đoạn đầu là chữ thì đứng cùng dòng với nhãn; còn lại (hình, công thức riêng dòng, đoạn thêm) xuống dòng dưới nhãn
    const inline = parts[0] !== undefined && !isBlockRuns(parts[0]);
    return {
      runs: run(`${LABELS[index]}.`, { style: STYLE.label }) + run(' ') + (inline ? parts[0] : ''),
      below: inline ? parts.slice(1) : parts,
      text: plainText(option.content),
    };
  });
  // Phương án có nội dung xuống dòng thì cả câu xếp mỗi Phương án một dòng (Q419)
  const hasBelow = options.some((option) => option.below.length > 0);
  const layout = hasBelow ? 'lines' : optionLayoutOf(options.map((option) => option.text));
  // số Phương án mỗi đoạn: cả hàng, hai Phương án, hoặc một
  const perParagraph = layout === 'row' ? options.length : layout === 'columns' ? 2 : 1;
  const stops = Array.from({ length: perParagraph - 1 }, (_, i) =>
    Math.round(((i + 1) * TEXT_WIDTH_TWIPS) / perParagraph),
  );
  const tabs = stops.length
    ? `<w:tabs>${stops.map((pos) => `<w:tab w:val="left" w:pos="${pos}"/>`).join('')}</w:tabs>`
    : '';

  const lines: string[] = [];
  for (let at = 0; at < options.length; at += perParagraph) {
    const group = options.slice(at, at + perParagraph);
    lines.push(
      paragraph(group.map((option) => option.runs).join('<w:r><w:tab/></w:r>'), tabs, STYLE.option),
    );
    for (const option of group) {
      for (const runs of option.below) {
        lines.push(
          paragraph(runs, isImageRuns(runs) ? '<w:jc w:val="center"/>' : '', STYLE.option),
        );
      }
    }
  }
  return stem + lines.join('');
};

const cluster: Renderer = (item, number, ctx) => {
  const statements = item.payload.statements as { content: unknown }[];
  return (
    stemOf(item, number, ctx) +
    statements
      .map((statement, index) =>
        paragraph(
          run(`${String.fromCharCode(97 + index)}) `) +
            (paragraphRuns(statement.content, ctx)[0] ?? ''),
        ),
      )
      .join('')
  );
};

const essay: Renderer = (item, number, ctx) => stemOf(item, number, ctx);

/**
 * Bảng đăng ký bộ trình bày theo Loại câu hỏi. Kiểu `Record<QuestionType, ...>` bắt buộc đủ mọi Loại:
 * thêm Loại vào `@exam/shared` mà quên ở đây thì không biên dịch được.
 */
const RENDERERS: Record<QuestionType, Renderer> = {
  single_choice: choice,
  multiple_choice: choice,
  true_false_cluster: cluster,
  essay,
};

export const renderItem = (item: PaperItem, number: number, images: ImageSource): RenderedItem => {
  const render = RENDERERS[item.type] as Renderer | undefined;
  if (!render) {
    // Loại từ dữ liệu mới hơn mã này: không bỏ im lặng, cũng không làm hỏng cả tệp.
    const warning = `Câu ${number}: Loại ${item.type} chưa hỗ trợ xuất`;
    return { xml: paragraph(run(warning, { bold: true, color: 'FF0000' })), warnings: [warning] };
  }
  const warnings = new Set<string>();
  const xml = render(item, number, {
    warn: (message) => warnings.add(`Câu ${number}: ${message}`),
    image: (id, alt) => images.drawing(id, alt),
  });
  return { xml, warnings: [...warnings] };
};
