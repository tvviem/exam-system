import type { Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { type DocxPart, readDocx } from './docx-reader.test-support';
import { buildPaperDocument, type PaperItem, type PaperSpec } from './paper-document';

// Mã lệnh trong đề Word (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.5).

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const text = (value: string, code = false) => ({
  type: 'text',
  text: value,
  ...(code ? { marks: [{ type: 'code' }] } : {}),
});
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const block = (value: string) => ({ type: 'codeBlock', content: [text(value)] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const plain = (value: string) => doc(para(text(value)));

const choice = (stem: unknown, options: unknown[]): PaperItem => ({
  type: 'single_choice',
  stem,
  payload: { options: options.map((content, i) => ({ id: `o${i + 1}`, content })) },
});

async function build(...items: PaperItem[]) {
  const spec: PaperSpec = {
    school: 'Trường',
    unit: 'Khoa',
    examCode: '1',
    heading: {
      title: 'THI',
      examName: 'Bộ đề',
      course: 'CTDL',
      date: '01/12/2026',
      form: 'Trắc nghiệm',
      duration: '60 phút',
    },
    sections: [{ title: null, items }],
  };
  const docx = await readDocx((await buildPaperDocument(spec)).bytes);
  return { body: await docx.part('word/document.xml'), styles: await docx.part('word/styles.xml') };
}

/** Tên kiểu đoạn (`w:pStyle`) và kiểu chữ (`w:rStyle`) hiển thị trong Word. */
const styleName = (styles: DocxPart, id: string | null | undefined) =>
  styles
    .all('style')
    .find((style) => styles.attr(style, 'styleId') === id)
    ?.getElementsByTagNameNS(W_NS, 'name')[0]
    ?.getAttributeNS(W_NS, 'val');

/** Các đoạn của thân đề: chữ (xuống dòng thành "\n") và tên kiểu đoạn. */
const paragraphsOf = (body: DocxPart, styles: DocxPart) =>
  body.all('p').map((p) => {
    const style = p.getElementsByTagNameNS(W_NS, 'pStyle')[0];
    return {
      style: style ? styleName(styles, body.attr(style, 'val')) : undefined,
      text: Array.from(p.getElementsByTagNameNS(W_NS, '*'))
        .filter((n) => n.localName === 't' || n.localName === 'br')
        .map((n) => (n.localName === 'br' ? '\n' : (n.textContent ?? '')))
        .join(''),
    };
  });

const program = 'for (i = 0; i < n; i++)\n\tif (a[i] > 0)\n    dem++;';
const printed = 'for (i = 0; i < n; i++)\n  if (a[i] > 0)\n    dem++;';

describe('đề Word có mã lệnh', () => {
  it('khối mã là một đoạn kiểu "Khối mã": giữ thụt lề và xuống dòng, tab thành hai dấu cách, phông Courier New', async () => {
    const { body, styles } = await build(
      choice(doc(para(text('Đoạn mã sau in gì?')), block(program)), [plain('1'), plain('2')]),
    );
    const paragraphs = paragraphsOf(body, styles);
    const at = paragraphs.findIndex((p) => p.style === 'Khối mã');
    expect(paragraphs[at]?.text).toBe(printed);
    expect(paragraphs[at - 1]?.text).toBe('Câu 1: Đoạn mã sau in gì?');
    const style = styles
      .all('style')
      .find((s) => styleName(styles, styles.attr(s, 'styleId')) === 'Khối mã') as Element;
    const fonts = style.getElementsByTagNameNS(W_NS, 'rFonts')[0] as Element;
    expect(styles.attr(fonts, 'ascii')).toBe('Courier New');
    expect(style.getElementsByTagNameNS(W_NS, 'pBdr')).toHaveLength(1);
  });

  it('Phần dẫn mở đầu bằng khối mã thì "Câu N:" đứng một mình', async () => {
    const { body, styles } = await build(choice(doc(block('x++;')), [plain('1'), plain('2')]));
    const paragraphs = paragraphsOf(body, styles);
    const at = paragraphs.findIndex((p) => p.style === 'Khối mã');
    expect(paragraphs[at - 1]?.text).toBe('Câu 1: ');
    expect(paragraphs[at]?.text).toBe('x++;');
  });

  it('mã trong dòng mang kiểu chữ "Mã trong dòng", chữ xung quanh giữ nguyên', async () => {
    const { body, styles } = await build(
      choice(doc(para(text('Biến '), text('p->Next', true), text(' trỏ đâu?'))), [
        plain('1'),
        plain('2'),
      ]),
    );
    const styled = body.all('r').flatMap((run) => {
      const ref = run.getElementsByTagNameNS(W_NS, 'rStyle')[0];
      return ref && styleName(styles, body.attr(ref, 'val')) === 'Mã trong dòng'
        ? [run.textContent]
        : [];
    });
    expect(styled).toEqual(['p->Next']);
  });

  it('Phương án có khối mã: mỗi Phương án một đoạn, khối mã nằm dưới nhãn', async () => {
    const { body, styles } = await build(
      choice(plain('Chọn'), [doc(block('a = 1;')), plain('2'), plain('3'), plain('4')]),
    );
    const paragraphs = paragraphsOf(body, styles).filter(
      (p) => /^[A-D]\./.test(p.text) || p.style === 'Khối mã',
    );
    expect(paragraphs.map((p) => p.text.trim())).toEqual(['A.', 'a = 1;', 'B. 2', 'C. 3', 'D. 4']);
  });

  it('Phương án chứa mã trong dòng được đo theo phông đơn cách: dài hơn chữ thường nên bớt cột', async () => {
    const code = 'i'.repeat(18); // chữ thường vừa một hàng bốn cột, phông đơn cách thì không
    const lines = async (first: unknown) => {
      const { body, styles } = await build(
        choice(plain('Chọn'), [first, plain('2'), plain('3'), plain('4')]),
      );
      return paragraphsOf(body, styles).filter((p) => /^[A-D]\./.test(p.text)).length;
    };
    expect(await lines(plain(code))).toBe(1);
    expect(await lines(doc(para(text(code, true))))).toBe(2);
  });

  it('Mệnh đề có khối mã: phần dưới dòng đầu không bị bỏ mất', async () => {
    const { body, styles } = await build({
      type: 'true_false_cluster',
      stem: plain('Xét'),
      payload: {
        statements: [
          { id: 's1', content: doc(para(text('Đoạn sau đúng:')), block('free(p);\np = NULL;')) },
        ],
      },
    });
    const paragraphs = paragraphsOf(body, styles);
    const at = paragraphs.findIndex((p) => p.text === 'a) Đoạn sau đúng:');
    expect(at).toBeGreaterThan(-1);
    expect(paragraphs[at + 1]).toEqual({ style: 'Khối mã', text: 'free(p);\np = NULL;' });
  });
});
