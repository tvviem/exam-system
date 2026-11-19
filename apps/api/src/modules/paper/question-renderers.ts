import type { QuestionType } from '@exam/shared';
import { optionLayoutOf } from './option-layout';
import { paragraphRuns, plainText, type Warn } from './rich-text';
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
type Renderer = (item: PaperItem, number: number, warn: Warn) => string;

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const TEXT_WIDTH_TWIPS = mmToTwips(193);

const stemOf = (item: PaperItem, number: number, warn: Warn): string => {
  const [first = '', ...rest] = paragraphRuns(item.stem, warn);
  return (
    paragraph(
      run(`Câu ${number}:`, { style: STYLE.label }) + run(' ') + first,
      '',
      STYLE.question,
    ) + rest.map((runs) => paragraph(runs)).join('')
  );
};

const choice: Renderer = (item, number, warn) => {
  const stem = stemOf(item, number, warn);

  const options = (item.payload.options as { content: unknown }[]).map((option, index) => ({
    runs:
      run(`${LABELS[index]}.`, { style: STYLE.label }) +
      run(' ') +
      (paragraphRuns(option.content, warn)[0] ?? ''),
    text: plainText(option.content),
  }));
  const layout = optionLayoutOf(options.map((option) => option.text));
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
    const group = options.slice(at, at + perParagraph).map((option) => option.runs);
    lines.push(paragraph(group.join('<w:r><w:tab/></w:r>'), tabs, STYLE.option));
  }
  return stem + lines.join('');
};

const cluster: Renderer = (item, number, warn) => {
  const statements = item.payload.statements as { content: unknown }[];
  return (
    stemOf(item, number, warn) +
    statements
      .map((statement, index) =>
        paragraph(
          run(`${String.fromCharCode(97 + index)}) `) +
            (paragraphRuns(statement.content, warn)[0] ?? ''),
        ),
      )
      .join('')
  );
};

const essay: Renderer = (item, number, warn) => stemOf(item, number, warn);

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

export const renderItem = (item: PaperItem, number: number): RenderedItem => {
  const render = RENDERERS[item.type] as Renderer | undefined;
  if (!render) {
    // Loại từ dữ liệu mới hơn mã này: không bỏ im lặng, cũng không làm hỏng cả tệp.
    const warning = `Câu ${number}: Loại ${item.type} chưa hỗ trợ xuất`;
    return { xml: paragraph(run(warning, { bold: true, color: 'FF0000' })), warnings: [warning] };
  }
  const warnings = new Set<string>();
  const xml = render(item, number, (message) => warnings.add(`Câu ${number}: ${message}`));
  return { xml, warnings: [...warnings] };
};
