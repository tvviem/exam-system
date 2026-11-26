import type { RichText } from '@exam/shared';
import {
  normalizeForSearch,
  normalizeTag,
  POINTS_MAX,
  POINTS_MIN,
  POINTS_STEP,
  TAG_MAX_CHARS,
  TAGS_MAX,
} from '@exam/shared';

// Đổi từng ô của file Nhập Excel thành giá trị của Câu hỏi (Q145, Q156). Hàm thuần, không biết sheet nào.

export const DEFAULT_POINTS = 1;
export const DEFAULT_ESSAY_MAX_LENGTH = 2000;
export const ESSAY_MAX_LENGTH_RANGE = { min: 100, max: 5000 } as const;

const DECIMAL = /^\d+([.,]\d+)?$/;

/** Trống = 1; chấp nhận dấu phẩy thập phân. null nếu không phải số 0,05–100 chia hết cho 0,05. */
export function parsePoints(value: string): number | null {
  if (value === '') return DEFAULT_POINTS;
  // Chỉ nhận số thập phân thường: `Number()` cũng nhận `0x10` hay `1e1`.
  if (!DECIMAL.test(value)) return null;
  const points = Number(value.replace(',', '.'));
  if (points < POINTS_MIN || points > POINTS_MAX) return null;
  // So sánh với sai số: 0,15 / 0,05 trong số thực không tròn đúng 3.
  const steps = points / POINTS_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-9 ? points : null;
}

export function parseTags(value: string): string[] | 'too_many_tags' | 'field_too_long' {
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

export type ScoringRule = 'proportional' | 'all_or_nothing' | 'ladder';

const RULE_NAMES: Record<string, ScoringRule> = {
  'ty le': 'proportional',
  'dung het': 'all_or_nothing',
  'bac thang': 'ladder',
};

/** Quy tắc chấm trống thì Tỷ lệ; tên ngoài danh sách `allowed` (hoặc không biết) là null. */
export function parseScoringRule(
  value: string,
  allowed: readonly ScoringRule[],
): ScoringRule | null {
  if (value === '') return 'proportional';
  const rule = RULE_NAMES[normalizeForSearch(value)];
  return rule && allowed.includes(rule) ? rule : null;
}

/** `A`, `A,C`, `a; c`... → chỉ số Phương án; null nếu trống, sai chữ, lặp hoặc trỏ Phương án không có. */
export function parseChoiceAnswer(value: string, optionCount: number): number[] | null {
  const letters = value.split(/[\s,;]+/).filter((t) => t !== '');
  if (letters.length === 0) return null;
  const indexes = letters.map((l) =>
    /^[a-hA-H]$/.test(l) ? l.toLowerCase().charCodeAt(0) - 97 : -1,
  );
  if (indexes.some((i) => i < 0 || i >= optionCount)) return null;
  return new Set(indexes).size === indexes.length ? indexes : null;
}

/** `Đ,S,Đ`, `Đúng; Sai`... → đúng/sai của từng Mệnh đề; null nếu sai chữ hoặc không đủ `count` giá trị. */
export function parseStatementKeys(value: string, count: number): boolean[] | null {
  const tokens = value.split(/[\s,;]+/).filter((t) => t !== '');
  if (tokens.length !== count) return null;
  const keys = tokens.map((token) => {
    const word = normalizeForSearch(token);
    if (word === 'd' || word === 'dung') return true;
    if (word === 's' || word === 'sai') return false;
    return null;
  });
  return keys.every((k): k is boolean => k !== null) ? keys : null;
}

/**
 * Bậc thang `0; 0,1; 0,25; 0,5; 1`: tách bằng dấu chấm phẩy hoặc khoảng trắng (dấu phẩy là dấu thập phân).
 * Trả null nếu không đúng quy tắc của Chùm đúng/sai: dài `statementCount + 1`, trong [0, 1], không giảm, đầu 0 và cuối 1.
 */
export function parseLadder(value: string, statementCount: number): number[] | null {
  const tokens = value.split(/[;\s]+/).filter((t) => t !== '');
  if (tokens.length !== statementCount + 1 || !tokens.every((t) => DECIMAL.test(t))) return null;
  const ladder = tokens.map((t) => Number(t.replace(',', '.')));
  const ok =
    ladder[0] === 0 &&
    ladder[ladder.length - 1] === 1 &&
    ladder.every((v, i) => v <= 1 && (i === 0 || v >= (ladder[i - 1] as number)));
  return ok ? ladder : null;
}

/** Độ dài tối đa của Câu tự luận: trống = 2.000; chỉ số nguyên trong 100–5.000. */
export function parseMaxLength(value: string): number | null {
  if (value === '') return DEFAULT_ESSAY_MAX_LENGTH;
  if (!/^\d+$/.test(value)) return null;
  const length = Number(value);
  return length >= ESSAY_MAX_LENGTH_RANGE.min && length <= ESSAY_MAX_LENGTH_RANGE.max
    ? length
    : null;
}

type Inline =
  | { type: 'text'; text: string; marks?: { type: 'code' }[] }
  | { type: 'hardBreak' }
  | { type: 'math'; attrs: { latex: string; display: false } };

type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'codeBlock'; content: { type: 'text'; text: string }[] };

/** Công thức (LaTeX) trong một nội dung có định dạng. */
export const formulasOf = (doc: RichText): string[] =>
  doc.content.flatMap((block) =>
    block.type === 'paragraph'
      ? (block.content ?? []).flatMap((node) => (node.type === 'math' ? [node.attrs.latex] : []))
      : [],
  );

/** Dòng mở hoặc đóng khối mã: chỉ có ba dấu `. */
const FENCE = /^\s*```\s*$/;

/**
 * Ô → nội dung có định dạng (Q145, Q492): các dòng giữa hai dòng ``` thành khối mã; phần còn lại thành đoạn văn, xuống dòng
 * thành `hardBreak`, `` `...` `` thành mã trong dòng, `$...$` thành công thức trong dòng. `` \` `` và `\$` là dấu thật.
 * Dấu mở không có dấu đóng, cặp rỗng và `$$` giữ nguyên là chữ.
 */
export function cellToDoc(text: string): RichText | null {
  if (text.trim() === '') return null;
  const lines = text.split(/\r\n?|\n/);
  const blocks: Block[] = [];
  let plain: string[] = [];
  const flush = () => {
    if (plain.some((line) => line.trim() !== '')) {
      const content = plain.flatMap((line, i): Inline[] => [
        ...(i > 0 ? [{ type: 'hardBreak' as const }] : []),
        ...inlineOf(line),
      ]);
      blocks.push({ type: 'paragraph', content });
    }
    plain = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (FENCE.test(line)) {
      const end = lines.findIndex((other, j) => j > i && FENCE.test(other));
      const code = end > i ? lines.slice(i + 1, end).join('\n') : '';
      if (code !== '') {
        flush();
        blocks.push({ type: 'codeBlock', content: [{ type: 'text', text: code }] });
        i = end;
        continue;
      }
    }
    plain.push(line);
  }
  flush();
  return { type: 'doc', content: blocks } as RichText;
}

/** Mã trong dòng mở tại `start`: nội dung và vị trí sau dấu đóng; `null` nếu không có dấu đóng hoặc cặp rỗng. */
function inlineCodeAt(line: string, start: number): { code: string; next: number } | null {
  let code = '';
  for (let j = start + 1; j < line.length; j++) {
    if (line[j] === '`') return code === '' ? null : { code, next: j + 1 };
    if (line[j] === '\\' && line[j + 1] === '`') j++;
    code += line[j];
  }
  return null;
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
    const code = char === '`' ? inlineCodeAt(line, i) : null;
    if (char === '\\' && (line[i + 1] === '$' || line[i + 1] === '`')) {
      buffer += line[i + 1];
      i += 2;
    } else if (code) {
      flush();
      nodes.push({ type: 'text', text: code.code, marks: [{ type: 'code' }] });
      i = code.next;
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
