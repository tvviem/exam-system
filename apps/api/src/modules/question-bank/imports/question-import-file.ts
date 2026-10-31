import {
  ITEM_MAX_CHARS,
  MATH_MAX_PER_QUESTION,
  normalizeForSearch,
  normalizeTag,
  POINTS_MAX,
  POINTS_MIN,
  POINTS_STEP,
  plainTextOf,
  type QuestionInput,
  questionInputSchema,
  type RichText,
  STEM_MAX_CHARS,
  TAG_MAX_CHARS,
  TAGS_MAX,
} from '@exam/shared';
import { type Cell, isFilled, readTable, SpreadsheetError } from '../../../common/spreadsheet';
import { checkLatex } from '../latex';

// Đọc file Excel/CSV nhập Câu hỏi (Q123, Q145): chỉ Câu chọn một và Câu chọn nhiều. Hàm thuần, không chạm DB.

export const MAX_IMPORT_ROWS = 500;
export const MAX_OPTIONS = 6;
const DEFAULT_POINTS = 1;
// Chỉ để chạy `questionInputSchema` (cần `topicId`); Chủ đề thật gắn lúc tạo Câu hỏi.
const PLACEHOLDER_TOPIC_ID = '00000000-0000-4000-8000-000000000000';

export type ImportFileErrorCode =
  | 'unsupported_file'
  | 'missing_columns'
  | 'empty_file'
  | 'too_many_rows';

/** Lỗi của cả file (khác lỗi từng dòng). */
export class QuestionImportFileError extends Error {
  constructor(readonly code: ImportFileErrorCode) {
    super(code);
  }
}

export type ImportRowErrorCode =
  | 'missing_content'
  | 'too_few_options'
  | 'gap_in_options'
  | 'answer_mismatch'
  | 'invalid_points'
  | 'scoring_rule_not_allowed'
  | 'invalid_scoring_rule'
  | 'field_too_long'
  | 'too_many_tags'
  | 'too_many_formulas'
  | 'math_invalid'
  | 'math_forbidden'
  | 'invalid_content';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Câu hỏi chưa gắn Chủ đề: những gì một dòng của file mô tả. */
export type DraftQuestion = DistributiveOmit<QuestionInput, 'topicId'>;

export interface ParsedQuestionRow {
  /** Số dòng trong file (dòng tiêu đề là dòng 1). */
  rowNumber: number;
  input: DraftQuestion | null;
  error: ImportRowErrorCode | null;
}

type Field = 'content' | 'answer' | 'points' | 'scoringRule' | 'tags' | `option${number}`;

const HEADERS: Record<string, Field> = {
  'noi dung': 'content',
  'dap an': 'answer',
  diem: 'points',
  'quy tac cham': 'scoringRule',
  tags: 'tags',
  tag: 'tags',
};
for (let i = 0; i < MAX_OPTIONS; i++) {
  HEADERS[`phuong an ${String.fromCharCode(97 + i)}`] = `option${i}`;
}

const REQUIRED: Field[] = ['content', 'option0', 'option1', 'answer'];

export async function parseQuestionImportFile(
  buffer: Buffer,
): Promise<{ rows: ParsedQuestionRow[] }> {
  let table: Awaited<ReturnType<typeof readTable>>;
  try {
    table = await readTable(buffer, MAX_IMPORT_ROWS);
  } catch (error) {
    if (error instanceof SpreadsheetError) throw new QuestionImportFileError(error.code);
    throw error;
  }

  const columns = new Map<Field, number>();
  table.header.forEach((title, index) => {
    const key = normalizeForSearch(title instanceof Date ? '' : title)
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const field = HEADERS[key];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  if (REQUIRED.some((field) => !columns.has(field))) {
    throw new QuestionImportFileError('missing_columns');
  }

  const records = table.records.filter((r) => r.cells.some(isFilled));
  if (records.length === 0) throw new QuestionImportFileError('empty_file');
  if (records.length > MAX_IMPORT_ROWS) throw new QuestionImportFileError('too_many_rows');

  return {
    rows: records.map(({ rowNumber, cells }) => {
      const text = (field: Field) => {
        const index = columns.get(field);
        const cell: Cell = index === undefined ? '' : (cells[index] ?? '');
        return cell instanceof Date ? '' : cell.trim();
      };
      const result = buildQuestion(text);
      return { rowNumber, ...result };
    }),
  };
}

type Built = { input: DraftQuestion; error: null } | { input: null; error: ImportRowErrorCode };
const fail = (error: ImportRowErrorCode): Built => ({ input: null, error });

function buildQuestion(text: (field: Field) => string): Built {
  const stem = cellToDoc(text('content'));
  if (!stem) return fail('missing_content');

  const optionTexts = Array.from({ length: MAX_OPTIONS }, (_, i) => text(`option${i}`));
  const filled = optionTexts.filter((t) => t !== '').length;
  // Ô trống nằm giữa các Phương án có chữ: không tự dồn lên vì sẽ làm lệch chữ cái của Đáp án.
  if (optionTexts.slice(0, filled).some((t) => t === '')) return fail('gap_in_options');
  if (filled < 2) return fail('too_few_options');
  const options = optionTexts.slice(0, filled).map((t, i) => ({
    id: `o${i + 1}`,
    content: cellToDoc(t) as RichText,
  }));

  const key = parseAnswer(text('answer'), filled);
  if (!key) return fail('answer_mismatch');

  const points = parsePoints(text('points'));
  if (points === null) return fail('invalid_points');

  const rule = parseScoringRule(text('scoringRule'), key.length > 1);
  if (rule === 'scoring_rule_not_allowed' || rule === 'invalid_scoring_rule') return fail(rule);

  const tags = parseTags(text('tags'));
  if (tags === 'too_many_tags' || tags === 'field_too_long') return fail(tags);

  const docs = [stem, ...options.map((o) => o.content)];
  if (plainTextOf(stem).length > STEM_MAX_CHARS) return fail('field_too_long');
  if (options.some((o) => plainTextOf(o.content).length > ITEM_MAX_CHARS)) {
    return fail('field_too_long');
  }
  const latex = docs.flatMap(formulasOf);
  if (latex.length > MATH_MAX_PER_QUESTION) return fail('too_many_formulas');
  const problems = latex.map(checkLatex);
  if (problems.includes('math_forbidden')) return fail('math_forbidden');
  if (problems.includes('math_invalid')) return fail('math_invalid');

  const candidate =
    key.length > 1
      ? {
          type: 'multiple_choice' as const,
          payload: { options, key, scoringRule: rule, shuffleOptions: true },
        }
      : { type: 'single_choice' as const, payload: { options, key, shuffleOptions: true } };
  const parsed = questionInputSchema.safeParse({
    ...candidate,
    topicId: PLACEHOLDER_TOPIC_ID,
    stem,
    defaultPoints: points,
    tags,
  });
  if (!parsed.success) return fail('invalid_content');
  const { topicId: _topicId, ...input } = parsed.data;
  return { input, error: null };
}

/** `A`, `A,C`, `a; c`... → mã Phương án; null nếu trống, sai chữ, lặp hoặc trỏ Phương án không có. */
function parseAnswer(value: string, optionCount: number): string[] | null {
  const letters = value.split(/[\s,;]+/).filter((t) => t !== '');
  if (letters.length === 0) return null;
  const indexes = letters.map((l) =>
    /^[a-fA-F]$/.test(l) ? l.toLowerCase().charCodeAt(0) - 97 : -1,
  );
  if (indexes.some((i) => i < 0 || i >= optionCount)) return null;
  if (new Set(indexes).size !== indexes.length) return null;
  return indexes.map((i) => `o${i + 1}`);
}

/** Trống = 1; chấp nhận dấu phẩy thập phân. null nếu không phải số 0,1–100 chia hết cho 0,1. */
function parsePoints(value: string): number | null {
  if (value === '') return DEFAULT_POINTS;
  // Chỉ nhận số thập phân thường: `Number()` cũng nhận `0x10` hay `1e1`.
  if (!/^\d+([.,]\d+)?$/.test(value)) return null;
  const points = Number(value.replace(',', '.'));
  if (points < POINTS_MIN || points > POINTS_MAX) return null;
  // So sánh với sai số: 0,3 / 0,1 trong số thực không tròn đúng 3.
  const steps = points / POINTS_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-9 ? points : null;
}

function parseScoringRule(
  value: string,
  multiple: boolean,
): 'proportional' | 'all_or_nothing' | 'scoring_rule_not_allowed' | 'invalid_scoring_rule' {
  if (value === '') return 'proportional';
  if (!multiple) return 'scoring_rule_not_allowed';
  const key = normalizeForSearch(value);
  if (key === 'ty le') return 'proportional';
  if (key === 'dung het') return 'all_or_nothing';
  return 'invalid_scoring_rule';
}

function parseTags(value: string): string[] | 'too_many_tags' | 'field_too_long' {
  const tags = [
    ...new Set(
      value
        .split(/[,;]/)
        .map(normalizeTag)
        .filter((t) => t !== ''),
    ),
  ];
  if (tags.some((t) => t.length > TAG_MAX_CHARS)) return 'field_too_long';
  return tags.length > TAGS_MAX ? 'too_many_tags' : tags;
}

type Inline =
  | { type: 'text'; text: string }
  | { type: 'hardBreak' }
  | { type: 'math'; attrs: { latex: string; display: false } };

const formulasOf = (doc: RichText): string[] =>
  doc.content.flatMap((block) =>
    block.type === 'paragraph'
      ? (block.content ?? []).flatMap((node) => (node.type === 'math' ? [node.attrs.latex] : []))
      : [],
  );

/**
 * Ô → nội dung có định dạng: một đoạn, xuống dòng thành `hardBreak`, `$...$` thành công thức trong dòng,
 * `\$` là dấu đô la thật. `$` lẻ hoặc `$$` rỗng giữ nguyên là chữ.
 */
function cellToDoc(text: string): RichText | null {
  if (text.trim() === '') return null;
  const nodes: Inline[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (i > 0) nodes.push({ type: 'hardBreak' });
    nodes.push(...inlineOf(line));
  });
  return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] } as RichText;
}

function inlineOf(line: string): Inline[] {
  const nodes: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer !== '') nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < line.length) {
    const char = line[i];
    if (char === '\\' && line[i + 1] === '$') {
      buffer += '$';
      i += 2;
    } else if (char === '$' && line[i + 1] === '$') {
      // `$$...$$` không hỗ trợ (Q145): giữ nguyên là chữ, không tách thành công thức.
      buffer += '$$';
      i += 2;
    } else if (char === '$') {
      let j = i + 1;
      let latex = '';
      while (j < line.length && line[j] !== '$') {
        // `\$` trong công thức là lệnh LaTeX in dấu đô la, giữ nguyên.
        const step = line[j] === '\\' && line[j + 1] === '$' ? 2 : 1;
        latex += line.slice(j, j + step);
        j += step;
      }
      if (j < line.length && latex.trim() !== '') {
        flush();
        nodes.push({ type: 'math', attrs: { latex: latex.trim(), display: false } });
        i = j + 1;
      } else {
        buffer += '$';
        i++;
      }
    } else {
      buffer += char;
      i++;
    }
  }
  flush();
  return nodes;
}
