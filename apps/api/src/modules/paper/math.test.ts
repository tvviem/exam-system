import type { Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { M_NS, readDocx } from './docx-reader.test-support';
import { MATH_CORPUS } from './math-corpus.test-support';
import { buildPaperDocument, type PaperItem, type PaperSpec } from './paper-document';

const baseSpec: PaperSpec = {
  school: 'Trường Đại học Bạc Liêu',
  unit: 'Khoa Kỹ thuật và Công nghệ',
  examCode: '132',
  heading: {
    title: 'THI KẾT THÚC HỌC PHẦN',
    examName: 'Bộ đề thử',
    course: 'Toán',
    date: '27/05/2026',
    form: 'Trắc nghiệm',
    duration: '60 phút',
  },
  sections: [],
};

const text = (value: string) => ({ type: 'text', text: value });
const math = (latex: string, display = false) => ({ type: 'math', attrs: { latex, display } });
const doc = (...content: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});
const essay = (stem: unknown): PaperItem => ({ type: 'essay', stem, payload: {} });

const build = async (...items: PaperItem[]) => {
  const { bytes, warnings } = await buildPaperDocument({
    ...baseSpec,
    sections: [{ title: null, items }],
  });
  return { warnings, part: await (await readDocx(bytes)).part('word/document.xml') };
};

/** Chữ trong các `m:t` của một phần tử OMML. */
const mathText = (element: Element) =>
  Array.from(element.getElementsByTagNameNS(M_NS, 't'))
    .map((t) => t.textContent ?? '')
    .join('');

describe('công thức trong .docx (LaTeX → OMML, công thức Word gốc)', () => {
  it('phân số trong câu thành m:oMath có tử số và mẫu số, không còn chỗ giữ màu đỏ, không cảnh báo', async () => {
    const { part, warnings } = await build(essay(doc(text('Tính '), math('\\frac{1}{2}'))));

    expect(part.allMath('oMath')).toHaveLength(1);
    const fraction = part.allMath('f')[0] as Element;
    expect(mathText(fraction.getElementsByTagNameNS(M_NS, 'num')[0] as Element)).toBe('1');
    expect(mathText(fraction.getElementsByTagNameNS(M_NS, 'den')[0] as Element)).toBe('2');
    expect(part.text()).not.toContain('[công thức');
    expect(warnings).toEqual([]);
  });

  it('công thức riêng dòng (display) đứng một đoạn riêng, canh giữa (m:oMathPara), chữ trước và sau tách thành đoạn của chúng', async () => {
    const { part } = await build(
      essay(doc(text('Tính tích phân '), math('\\int_0^1 x\\,dx', true), text(' rồi kết luận.'))),
    );

    const paragraphs = Array.from(part.xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)).map((m) => m[0]);
    const withMath = paragraphs.filter((p) => p.includes('<m:oMathPara>'));
    expect(withMath).toHaveLength(1);
    // đoạn công thức không chứa chữ thường nào ngoài công thức
    expect((withMath[0] as string).replace(/<m:oMathPara>[\s\S]*<\/m:oMathPara>/, '')).not.toMatch(
      /<w:t[ >]/,
    );
    const texts = part.paragraphs();
    expect(texts).toContain('Câu 1: Tính tích phân ');
    expect(texts).toContain(' rồi kết luận.');
  });

  it('câu mở đầu bằng công thức riêng dòng: "Câu N:" đứng một mình, công thức xuống đoạn kế', async () => {
    const { part } = await build(essay(doc(math('x^2+1', true), text('Giá trị nhỏ nhất là?'))));

    const paragraphs = Array.from(part.xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)).map((m) => m[0]);
    const stem = paragraphs.find((p) => p.includes('Câu 1:')) as string;
    expect(stem).not.toContain('<m:oMathPara>');
    expect(paragraphs.filter((p) => p.includes('<m:oMathPara>'))).toHaveLength(1);
  });

  describe('ngoặc giãn theo chiều cao (m:d): \\left ... \\right thành đối tượng ngoặc của Word', () => {
    const delimiters = async (latex: string) => {
      const { part } = await build(essay(doc(math(latex))));
      return part.allMath('d').map((d) => ({
        open: part.mathAttr(d.getElementsByTagNameNS(M_NS, 'begChr')[0] as Element, 'val'),
        close: part.mathAttr(d.getElementsByTagNameNS(M_NS, 'endChr')[0] as Element, 'val'),
        text: mathText(d),
      }));
    };

    it('ngoặc tròn quanh phân số; giá trị tuyệt đối', async () => {
      expect(await delimiters('\\left(\\frac{a}{b}\\right)')).toEqual([
        { open: '(', close: ')', text: 'ab' },
      ]);
      expect(await delimiters('\\left| x-2 \\right| \\le 3')).toEqual([
        { open: '|', close: '|', text: 'x−2' },
      ]);
    });

    it('ngoặc lồng nhau thành hai m:d lồng nhau, từ ngoài vào trong', async () => {
      const result = await delimiters('\\left( \\left[ x \\right] + 1 \\right)');
      expect(result.map((d) => [d.open, d.close])).toEqual([
        ['(', ')'],
        ['[', ']'],
      ]);
    });

    it('hệ phương trình (cases): ngoặc nhọn mở, không có ngoặc đóng', async () => {
      const result = await delimiters('\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}');
      expect(result).toHaveLength(1);
      expect(result[0]?.open).toBe('{');
      expect(result[0]?.close).toBe('');
    });
  });

  describe('độ đúng của các cấu trúc mà thư viện chuyển đổi làm sai', () => {
    const formula = async (latex: string, display = false) => {
      const { part, warnings } = await build(essay(doc(math(latex, display))));
      return { part, warnings, root: part.allMath('oMath')[0] as Element };
    };

    it('tổ hợp \\binom: ngoặc tròn quanh phân số không vạch (noBar)', async () => {
      const { part } = await formula('\\binom{n}{k}');
      const fraction = part.allMath('f')[0] as Element;
      const type = fraction.getElementsByTagNameNS(M_NS, 'type')[0] as Element;
      expect(part.mathAttr(type, 'val')).toBe('noBar');
      expect(part.allMath('d')).toHaveLength(1);
    });

    it('chữ kép nét \\mathbb{R} ra ký tự ℝ', async () => {
      const { root } = await formula('x \\in \\mathbb{R}');
      expect(mathText(root)).toContain('ℝ');
    });

    it('gạch ngang trên \\overline{AB} là m:bar phía trên, không phải dấu m:acc', async () => {
      const { part } = await formula('\\overline{AB}');
      expect(part.allMath('bar')).toHaveLength(1);
      expect(part.allMath('acc')).toHaveLength(0);
      const position = part.allMath('pos')[0] as Element;
      expect(part.mathAttr(position, 'val')).toBe('top');
    });

    it('chữ Việt trong \\text{} giữ nguyên dấu', async () => {
      const { root, warnings } = await formula('\\underbrace{a+b+c}_{3\\text{ số hạng}}');
      expect(mathText(root)).toContain('số hạng');
      expect(warnings).toEqual([]);
    });

    it('hệ căn dấu bằng (aligned): cột đầu căn phải, cột sau căn trái', async () => {
      const { part } = await formula(
        '\\begin{aligned} x &= 2y + 1 \\\\ y &= 3 \\end{aligned}',
        true,
      );
      const alignments = part.allMath('mcJc').map((e) => part.mathAttr(e, 'val'));
      expect(alignments).toEqual(['right', 'left']);
    });
  });

  it('công thức không chuyển được (LaTeX hỏng, hoặc cấu trúc chưa hỗ trợ như \\overset): chữ đỏ mã LaTeX tại chỗ, một cảnh báo theo câu, phần còn lại của tệp nguyên vẹn', async () => {
    const { part, warnings } = await build(
      essay(
        doc(
          text('A '),
          math('\\overset{def}{=}'),
          text(' B '),
          math('\\frac{'),
          text(' C '),
          math('\\frac{1}{2}'),
        ),
      ),
    );

    expect(part.paragraphs()).toContain(
      'Câu 1: A [công thức: \\overset{def}{=}] B [công thức: \\frac{] C ',
    );
    expect(part.allMath('oMath')).toHaveLength(1); // chỉ công thức chuyển được
    expect(warnings).toEqual(['Câu 1: công thức chưa hỗ trợ xuất, đã in mã LaTeX']);
  });

  describe('bộ công thức mẫu (đề thi STEM tiếng Việt)', () => {
    // Chưa chuyển được: xem bài "công thức không chuyển được".
    const UNSUPPORTED = ['\\overset{def}{=}'];

    /** Vấn đề cấu trúc của một công thức: chữ trần ngoài m:t, thẻ lạ trong m:t, giá trị "undefined", ký tự giữ chỗ sót. */
    const problemsOf = (root: Element): string[] => {
      const problems: string[] = [];
      const walk = (node: Element) => {
        for (let i = 0; i < node.attributes.length; i++) {
          if (node.attributes[i]?.value === 'undefined')
            problems.push(`undefined ở ${node.nodeName}`);
        }
        for (const child of Array.from(node.childNodes) as unknown as (Element & {
          data?: string;
        })[]) {
          if ((child.nodeType as number) === 3) {
            const value = child.data ?? '';
            if (/[\uE000\uE001]/.test(value)) problems.push('ký tự giữ chỗ còn sót');
            if (value.trim() !== '' && !['m:t', 'w:t'].includes(node.nodeName)) {
              problems.push(`chữ trần trong ${node.nodeName}: "${value.trim().slice(0, 20)}"`);
            }
          } else if ((child.nodeType as number) === 1) {
            if (node.nodeName === 'm:t') problems.push(`thẻ ${child.nodeName} nằm trong m:t`);
            walk(child);
          }
        }
      };
      walk(root);
      return problems;
    };

    it.each(MATH_CORPUS.filter((sample) => !UNSUPPORTED.includes(sample.latex)))(
      '$id $latex: ra đúng một công thức Word hợp lệ, không cảnh báo',
      async ({ latex, display }) => {
        const { part, warnings } = await build(essay(doc(text('Cho '), math(latex, display))));

        const formulas = part.allMath('oMath');
        expect(formulas).toHaveLength(1);
        expect(problemsOf(formulas[0] as Element)).toEqual([]);
        expect(warnings).toEqual([]);
        expect(part.text()).not.toContain('[công thức');
      },
    );
  });
});
