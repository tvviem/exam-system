import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MATH_CORPUS } from './math-corpus.test-support';
import {
  buildPaperDocument,
  type PaperImage,
  type PaperItem,
  type PaperSpec,
} from './paper-document';

/** Ngân sách phản hồi (docs/plan/xuat-bo-de-thiet-ke.md mục 5.3): Bộ đề 100 câu, 10 hình, 30 công thức dựng dưới 1 giây. */
const BUDGET_MS = 1000;

const illustration = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });

describe('hiệu năng dựng bản xuất', () => {
  it('Bộ đề 100 câu, 10 hình (WebP 960 px), 30 công thức dựng dưới 1 giây', async () => {
    // hình WebP 960x640 như biến thể thật của hệ thống
    const webp = new Uint8Array(
      await sharp({
        create: { width: 960, height: 640, channels: 3, background: { r: 30, g: 90, b: 200 } },
      })
        .webp({ quality: 80 })
        .toBuffer(),
    );
    const images = new Map<string, PaperImage>(
      Array.from({ length: 10 }, (_, i): [string, PaperImage] => [
        illustration(i + 1),
        { bytes: webp, widthPx: 960, heightPx: 640 },
      ]),
    );
    const formulas = MATH_CORPUS.filter((sample) => !sample.latex.includes('overset')).slice(0, 30);

    const items: PaperItem[] = Array.from({ length: 100 }, (_, i) => {
      const formula = formulas[i % formulas.length];
      const hasFormula = i < 30 && formula !== undefined;
      const stem = {
        type: 'doc',
        content: [
          paragraph(
            text(`Nội dung câu số ${i + 1}, hãy chọn phương án đúng nhất. `),
            ...(hasFormula
              ? [{ type: 'math', attrs: { latex: formula.latex, display: formula.display } }]
              : []),
          ),
          ...(i < 10
            ? [
                {
                  type: 'image',
                  attrs: { illustrationId: illustration(i + 1), alt: `Hình ${i + 1}` },
                },
              ]
            : []),
        ],
      };
      const option = (value: string, k: number) => ({
        id: `o${k}`,
        content: { type: 'doc', content: [paragraph(text(value))] },
      });
      return {
        type: 'single_choice',
        stem,
        payload: {
          options: ['Phương án một', 'Phương án hai', 'Phương án ba', 'Phương án bốn'].map(option),
        },
      };
    });
    const spec: PaperSpec = {
      school: 'Trường Đại học Bạc Liêu',
      unit: 'Khoa Kỹ thuật và Công nghệ',
      examCode: '132',
      heading: {
        title: 'THI KẾT THÚC HỌC PHẦN',
        examName: 'Bộ đề 100 câu',
        course: 'Toán',
        date: '27/05/2026',
        form: 'Trắc nghiệm',
        duration: '90 phút',
      },
      images,
      sections: [{ title: null, items }],
    };

    const started = performance.now();
    const { bytes, warnings } = await buildPaperDocument(spec);
    const elapsed = performance.now() - started;
    console.log(
      `dựng ${items.length} câu, 10 hình, 30 công thức: ${elapsed.toFixed(0)} ms, ${(bytes.length / 1024).toFixed(0)} KB`,
    );

    expect(warnings).toEqual([]);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
