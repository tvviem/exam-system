import { richTextSchema } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import { cellToDoc, formulasOf } from './question-import-cells';

// Mã lệnh trong ô Excel (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.4, Q492).

const t = (text: string) => ({ type: 'text', text });
const c = (text: string) => ({ type: 'text', text, marks: [{ type: 'code' }] });
const math = (latex: string) => ({ type: 'math', attrs: { latex, display: false } });
const br = { type: 'hardBreak' };
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const block = (text: string) => ({ type: 'codeBlock', content: [t(text)] });

/** Các khối của ô, đã qua đúng schema mà hệ thống lưu. */
const blocks = (cell: string) => richTextSchema.parse(cellToDoc(cell)).content;

describe('ô Excel: mã trong dòng', () => {
  it('chữ giữa hai dấu ` là mã trong dòng', () => {
    expect(blocks('Cho `p->Next` và `a[i]`.')).toEqual([
      p(t('Cho '), c('p->Next'), t(' và '), c('a[i]'), t('.')),
    ]);
  });

  it('trong mã, $ là chữ thường; ngoài mã vẫn là công thức; dấu ` trong công thức thuộc công thức', () => {
    expect(blocks('`echo $a $b` có $n$ và $`x`$')).toEqual([
      p(c('echo $a $b'), t(' có '), math('n'), t(' và '), math('`x`')),
    ]);
  });

  it('\\` là dấu ` thường, cả trong lẫn ngoài mã; chỗ khác của dấu \\ giữ nguyên', () => {
    expect(blocks('Dấu \\` và `a\\`b\\n`')).toEqual([p(t('Dấu ` và '), c('a`b\\n'))]);
  });

  it('dấu ` lẻ hoặc cặp rỗng giữ nguyên là chữ', () => {
    expect(blocks('còn ` lẻ')).toEqual([p(t('còn ` lẻ'))]);
    expect(blocks('rỗng `` nhé')).toEqual([p(t('rỗng `` nhé'))]);
  });
});

describe('ô Excel: khối mã', () => {
  it('các dòng giữa hai dòng ``` là khối mã, giữ thụt lề, tab và ký tự đặc biệt; chữ trước, sau thành đoạn riêng', () => {
    const cell =
      'Đoạn sau in gì?\r\n```\r\nfor (i = 0; i < n; i++)\r\n\tif (*p) `$x`;\r\n\r\n    dem++;\r\n```\r\nChọn đáp án:\r\nmột';
    expect(blocks(cell)).toEqual([
      p(t('Đoạn sau in gì?')),
      block('for (i = 0; i < n; i++)\n\tif (*p) `$x`;\n\n    dem++;'),
      p(t('Chọn đáp án:'), br, t('một')),
    ]);
  });

  it('ô chỉ có khối mã; dòng ``` được phép có khoảng trắng thừa; nhiều khối trong một ô', () => {
    expect(blocks('  ```  \na;\n ``` ')).toEqual([block('a;')]);
    expect(blocks('```\na;\n```\n```\nb;\n```')).toEqual([block('a;'), block('b;')]);
  });

  it.each([
    ['không có dòng đóng', '```\na;'],
    ['khối rỗng', '```\n```'],
    ['``` không đứng riêng một dòng', 'viết ``` trong câu'],
  ])('%s thì giữ nguyên là chữ', (_name, cell) => {
    const [first, ...rest] = blocks(cell);
    expect(rest).toEqual([]);
    expect(first?.type).toBe('paragraph');
    const text = (first as { content: { text?: string; type: string }[] }).content
      .map((node) => (node.type === 'hardBreak' ? '\n' : node.text))
      .join('');
    expect(text).toBe(cell);
  });

  it('công thức trong các đoạn quanh khối mã vẫn được đếm, trong mã thì không', () => {
    const doc = cellToDoc('Với $a$\n```\nx = "$b$";\n```\nvà $c$');
    expect(doc && formulasOf(doc)).toEqual(['a', 'c']);
  });
});
