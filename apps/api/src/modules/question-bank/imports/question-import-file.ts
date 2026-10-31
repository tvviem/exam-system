import {
  ITEM_MAX_CHARS,
  MATH_MAX_PER_QUESTION,
  normalizeForSearch,
  plainTextOf,
  type QuestionInput,
  type QuestionType,
  questionInputSchema,
  type RichText,
  STEM_MAX_CHARS,
} from '@exam/shared';
import {
  type Cell,
  isFilled,
  readWorkbook,
  SpreadsheetError,
  type Table,
} from '../../../common/spreadsheet';
import { checkLatex } from '../latex';
import {
  cellToDoc,
  formulasOf,
  parseChoiceAnswer,
  parseLadder,
  parseMaxLength,
  parsePoints,
  parseScoringRule,
  parseStatementKeys,
  parseTags,
} from './question-import-cells';

// Đọc file Excel nhập Câu hỏi (Q123, Q145, Q156): một file `.xlsx`, mỗi Loại câu hỏi một sheet. Hàm thuần, không chạm DB.

export const MAX_IMPORT_ROWS = 500;
/** Số cột Phương án (A–H) hoặc Mệnh đề (a–h) của mẫu, bằng giới hạn của trình soạn. */
export const MAX_OPTIONS = 8;
// Chỉ để chạy `questionInputSchema` (cần `topicId`); Chủ đề thật gắn lúc tạo Câu hỏi.
const PLACEHOLDER_TOPIC_ID = '00000000-0000-4000-8000-000000000000';

export type ImportFileErrorCode =
  | 'unsupported_file'
  | 'missing_columns'
  | 'empty_file'
  | 'too_many_rows'
  | 'unknown_sheet'
  | 'duplicate_sheet';

/** Lỗi của cả file (khác lỗi từng dòng); `sheet` là tên sheet gây lỗi, nếu có. */
export class QuestionImportFileError extends Error {
  constructor(
    readonly code: ImportFileErrorCode,
    readonly sheet?: string,
  ) {
    super(code);
  }
}

export type ImportRowErrorCode =
  | 'missing_content'
  | 'too_few_options'
  | 'gap_in_options'
  | 'answer_mismatch'
  | 'invalid_statement_key'
  | 'invalid_points'
  | 'invalid_scoring_rule'
  | 'invalid_ladder'
  | 'invalid_max_length'
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
  /** Loại câu hỏi, do sheet quyết định. */
  type: QuestionType;
  /** Số dòng trong sheet của nó (dòng tiêu đề là dòng 1). */
  rowNumber: number;
  input: DraftQuestion | null;
  error: ImportRowErrorCode | null;
}

type Field =
  | 'content'
  | 'answer'
  | 'points'
  | 'scoringRule'
  | 'ladder'
  | 'maxLength'
  | 'rubric'
  | 'tags'
  | `item${number}`;
type TextOf = (field: Field) => string;

/** Phần riêng của từng Loại câu hỏi sau khi đọc xong các ô của nó. */
interface Part {
  candidate: { type: QuestionType; payload: unknown };
  /** Phương án hoặc Mệnh đề (giới hạn `ITEM_MAX_CHARS`). */
  items: RichText[];
  /** Hướng dẫn chấm (giới hạn như Phần dẫn). */
  notes: RichText[];
}

interface SheetSpec {
  type: QuestionType;
  /** Tên sheet đã chuẩn hóa (không dấu, chữ thường). */
  name: string;
  /** Tiền tố tiêu đề cột của Phương án / Mệnh đề; null nếu Loại này không có. */
  itemTitle: string | null;
  required: Field[];
  read: (text: TextOf) => Part | ImportRowErrorCode;
}

const SHEETS: SheetSpec[] = [
  {
    type: 'single_choice',
    name: 'chon mot',
    itemTitle: 'phuong an',
    required: ['content', 'item0', 'item1', 'answer'],
    read: (text) => readChoice(text, false),
  },
  {
    type: 'multiple_choice',
    name: 'chon nhieu',
    itemTitle: 'phuong an',
    required: ['content', 'item0', 'item1', 'answer'],
    read: (text) => readChoice(text, true),
  },
  {
    type: 'true_false_cluster',
    name: 'chum dung sai',
    itemTitle: 'menh de',
    required: ['content', 'item0', 'answer'],
    read: readCluster,
  },
  { type: 'essay', name: 'tu luan', itemTitle: null, required: ['content'], read: readEssay },
];
const GUIDE_SHEET = 'huong dan';

const searchKey = (title: string) =>
  normalizeForSearch(title)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const COMMON_HEADERS: Record<string, Field> = {
  'noi dung': 'content',
  'dap an': 'answer',
  diem: 'points',
  'quy tac cham': 'scoringRule',
  'bac thang': 'ladder',
  'do dai toi da': 'maxLength',
  'huong dan cham': 'rubric',
  tags: 'tags',
  tag: 'tags',
};

function columnsOf(header: Cell[], spec: SheetSpec): Map<Field, number> {
  const titles: Record<string, Field> = { ...COMMON_HEADERS };
  if (spec.itemTitle) {
    for (let i = 0; i < MAX_OPTIONS; i++) {
      titles[`${spec.itemTitle} ${String.fromCharCode(97 + i)}`] = `item${i}`;
    }
  }
  const columns = new Map<Field, number>();
  header.forEach((title, index) => {
    const field = titles[searchKey(title instanceof Date ? '' : title)];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  return columns;
}

export async function parseQuestionImportFile(
  buffer: Buffer,
): Promise<{ rows: ParsedQuestionRow[] }> {
  let sheets: Awaited<ReturnType<typeof readWorkbook>>;
  try {
    sheets = await readWorkbook(buffer, MAX_IMPORT_ROWS);
  } catch (error) {
    if (error instanceof SpreadsheetError) throw new QuestionImportFileError(error.code);
    throw error;
  }

  const tables = new Map<SheetSpec, { name: string; table: Table }>();
  for (const { name, table } of sheets) {
    const key = searchKey(name);
    if (key === GUIDE_SHEET) continue;
    const spec = SHEETS.find((s) => s.name === key);
    if (!spec) throw new QuestionImportFileError('unknown_sheet', name);
    if (tables.has(spec)) throw new QuestionImportFileError('duplicate_sheet', name);
    tables.set(spec, { name, table });
  }

  const rows: ParsedQuestionRow[] = [];
  // Theo thứ tự sheet của mẫu, không theo thứ tự trong file.
  for (const spec of SHEETS) {
    const found = tables.get(spec);
    const records = found?.table.records.filter((r) => r.cells.some(isFilled)) ?? [];
    // Sheet không có dòng dữ liệu thì bỏ qua, kể cả khi dòng tiêu đề bị sửa hay xóa.
    if (!found || records.length === 0) continue;

    const columns = columnsOf(found.table.header, spec);
    if (spec.required.some((field) => !columns.has(field))) {
      throw new QuestionImportFileError('missing_columns', found.name);
    }
    for (const { rowNumber, cells } of records) {
      const text: TextOf = (field) => {
        const index = columns.get(field);
        const cell: Cell = index === undefined ? '' : (cells[index] ?? '');
        return cell instanceof Date ? '' : cell.trim();
      };
      rows.push({ type: spec.type, rowNumber, ...buildQuestion(spec, text) });
    }
    if (rows.length > MAX_IMPORT_ROWS) throw new QuestionImportFileError('too_many_rows');
  }
  if (rows.length === 0) throw new QuestionImportFileError('empty_file');
  return { rows };
}

type Built = { input: DraftQuestion; error: null } | { input: null; error: ImportRowErrorCode };
const fail = (error: ImportRowErrorCode): Built => ({ input: null, error });

function buildQuestion(spec: SheetSpec, text: TextOf): Built {
  const stem = cellToDoc(text('content'));
  if (!stem) return fail('missing_content');

  const part = spec.read(text);
  if (typeof part === 'string') return fail(part);

  const points = parsePoints(text('points'));
  if (points === null) return fail('invalid_points');
  const tags = parseTags(text('tags'));
  if (typeof tags === 'string') return fail(tags);

  if (plainTextOf(stem).length > STEM_MAX_CHARS) return fail('field_too_long');
  if (part.items.some((doc) => plainTextOf(doc).length > ITEM_MAX_CHARS)) {
    return fail('field_too_long');
  }
  if (part.notes.some((doc) => plainTextOf(doc).length > STEM_MAX_CHARS)) {
    return fail('field_too_long');
  }
  const latex = [stem, ...part.items, ...part.notes].flatMap(formulasOf);
  if (latex.length > MATH_MAX_PER_QUESTION) return fail('too_many_formulas');
  const problems = latex.map(checkLatex);
  if (problems.includes('math_forbidden')) return fail('math_forbidden');
  if (problems.includes('math_invalid')) return fail('math_invalid');

  const parsed = questionInputSchema.safeParse({
    ...part.candidate,
    topicId: PLACEHOLDER_TOPIC_ID,
    stem,
    defaultPoints: points,
    tags,
  });
  if (!parsed.success) return fail('invalid_content');
  const { topicId: _topicId, ...input } = parsed.data;
  return { input, error: null };
}

/**
 * Các ô Phương án / Mệnh đề từ cột đầu tiên. Ô trống nằm giữa các ô có chữ là lỗi: không tự dồn lên vì sẽ làm lệch
 * chữ cái của Đáp án.
 */
function itemsOf(text: TextOf, minimum: number): { docs: RichText[] } | ImportRowErrorCode {
  const texts = Array.from({ length: MAX_OPTIONS }, (_, i) => text(`item${i}`));
  const filled = texts.filter((t) => t !== '').length;
  if (texts.slice(0, filled).some((t) => t === '')) return 'gap_in_options';
  if (filled < minimum) return 'too_few_options';
  return { docs: texts.slice(0, filled).map((t) => cellToDoc(t) as RichText) };
}

function readChoice(text: TextOf, multiple: boolean): Part | ImportRowErrorCode {
  const items = itemsOf(text, 2);
  if (typeof items === 'string') return items;
  const options = items.docs.map((content, i) => ({ id: `o${i + 1}`, content }));

  const indexes = parseChoiceAnswer(text('answer'), options.length);
  // Loại do sheet quyết định: một Đáp án ở "Chọn một", từ một ở "Chọn nhiều"; không tự đổi Loại theo số chữ.
  if (!indexes || (!multiple && indexes.length !== 1)) return 'answer_mismatch';
  const key = indexes.map((i) => `o${i + 1}`);

  if (!multiple) {
    return {
      candidate: { type: 'single_choice', payload: { options, key, shuffleOptions: true } },
      items: items.docs,
      notes: [],
    };
  }
  const rule = parseScoringRule(text('scoringRule'), ['proportional', 'all_or_nothing']);
  if (!rule) return 'invalid_scoring_rule';
  return {
    candidate: {
      type: 'multiple_choice',
      payload: { options, key, scoringRule: rule, shuffleOptions: true },
    },
    items: items.docs,
    notes: [],
  };
}

function readCluster(text: TextOf): Part | ImportRowErrorCode {
  const items = itemsOf(text, 1);
  if (typeof items === 'string') return items;

  const keys = parseStatementKeys(text('answer'), items.docs.length);
  if (!keys) return 'invalid_statement_key';
  const rule = parseScoringRule(text('scoringRule'), ['proportional', 'all_or_nothing', 'ladder']);
  if (!rule) return 'invalid_scoring_rule';

  // Bậc thang chỉ đi cùng quy tắc Bậc thang: điền một trong hai mà thiếu bên kia là lỗi, không đoán ý người nhập.
  const ladderText = text('ladder');
  let ladder: number[] | undefined;
  if (rule === 'ladder') {
    const parsed = parseLadder(ladderText, items.docs.length);
    if (!parsed) return 'invalid_ladder';
    ladder = parsed;
  } else if (ladderText !== '') {
    return 'invalid_ladder';
  }

  const statements = items.docs.map((content, i) => ({
    id: `s${i + 1}`,
    content,
    key: keys[i] as boolean,
  }));
  return {
    candidate: {
      type: 'true_false_cluster',
      payload: { statements, scoringRule: rule, ...(ladder ? { ladder } : {}) },
    },
    items: items.docs,
    notes: [],
  };
}

function readEssay(text: TextOf): Part | ImportRowErrorCode {
  const maxLength = parseMaxLength(text('maxLength'));
  if (maxLength === null) return 'invalid_max_length';
  const rubric = cellToDoc(text('rubric'));
  return {
    candidate: { type: 'essay', payload: { maxLength, ...(rubric ? { rubric } : {}) } },
    items: [],
    notes: rubric ? [rubric] : [],
  };
}
