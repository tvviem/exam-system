import type { Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { readDocx } from './docx-reader.test-support';
import { buildAnswerDocument } from './paper-answer-document';
import type { AnswerSpec } from './paper-answer-spec';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const rt = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const baseSpec: AnswerSpec = {
  school: 'Trường Đại học Bạc Liêu',
  unit: 'Khoa Kỹ thuật và Công nghệ',
  examCode: '132',
  heading: {
    title: 'THI KẾT THÚC HỌC PHẦN',
    examName: 'Giữa kỳ Giải tích',
    course: 'Giải tích 1',
    date: '27/05/2026',
    form: 'Trắc nghiệm',
    duration: '60 phút',
  },
  sections: [
    {
      title: null,
      rows: [
        { number: 1, answer: 'B', points: '1', method: '', corrected: false },
        { number: 2, answer: 'A, C', points: '2', method: 'Theo tỉ lệ số ý đúng', corrected: true },
      ],
    },
    {
      title: 'PHẦN II. TỰ LUẬN',
      rows: [
        { number: 3, answer: 'Xem hướng dẫn chấm', points: '5', method: '', corrected: false },
      ],
    },
  ],
  totalPoints: '8',
  guides: [{ number: 3, rubric: rt('Nêu đủ định nghĩa ε-δ') }],
};

/** Các bảng của tài liệu: mỗi bảng là danh sách hàng, mỗi hàng là danh sách chữ trong ô. */
const tablesOf = (document: Awaited<ReturnType<Awaited<ReturnType<typeof readDocx>>['part']>>) =>
  document
    .all('tbl')
    .map((tbl) =>
      Array.from((tbl as Element).getElementsByTagNameNS(W_NS, 'tr')).map((tr) =>
        Array.from(tr.getElementsByTagNameNS(W_NS, 'tc')).map((tc) => tc.textContent ?? ''),
      ),
    );

describe('buildAnswerDocument: tệp Đáp án và thang điểm', () => {
  it('đầu và chân trang như tệp Đề (cùng Mã đề), tiêu đề tệp, khung thông tin gọn, bảng đáp án theo từng Phần có hàng tiêu đề', async () => {
    const { bytes } = await buildAnswerDocument(baseSpec);
    const docx = await readDocx(bytes);
    const document = await docx.part('word/document.xml');

    expect((await docx.part('word/header1.xml')).text()).toBe('Trường Đại học Bạc Liêu');
    const footer = (await docx.part('word/footer1.xml')).text();
    expect(footer).toContain('Khoa Kỹ thuật và Công nghệ');
    expect(footer).toContain('Mã đề thi 132');

    const paragraphs = document.paragraphs();
    expect(paragraphs).toContain('ĐÁP ÁN VÀ THANG ĐIỂM');
    expect(paragraphs).toContain('PHẦN II. TỰ LUẬN');

    const [cover, first, second] = tablesOf(document);
    // khung thông tin gọn: chỉ một ô thông tin kỳ thi, không có ô thí sinh
    expect(cover?.flat().join('|')).toContain('Học phần: Giải tích 1');
    expect(cover?.flat().join('|')).not.toContain('Mã SV');
    expect(first).toEqual([
      ['Câu', 'Đáp án', 'Điểm', 'Cách chấm'],
      ['1', 'B', '1', ''],
      ['2', 'A, C (đã đính chính)', '2', 'Theo tỉ lệ số ý đúng'],
    ]);
    expect(second).toEqual([
      ['Câu', 'Đáp án', 'Điểm', 'Cách chấm'],
      ['3', 'Xem hướng dẫn chấm', '5', ''],
    ]);
  });

  it('tổng điểm kèm ghi chú thang 10, rồi hướng dẫn chấm của các câu tự luận (nguyên văn); không có hướng dẫn thì không in mục này', async () => {
    const { bytes } = await buildAnswerDocument(baseSpec);
    const paragraphs = (await (await readDocx(bytes)).part('word/document.xml')).paragraphs();

    expect(paragraphs).toContain('Tổng điểm: 8');
    expect(paragraphs).toContain('Điểm quy về thang 10 theo tổng điểm của Bộ đề (tổng 8 điểm).');
    const at = (text: string) => paragraphs.findIndex((p) => p.startsWith(text));
    expect(at('Hướng dẫn chấm')).toBeGreaterThan(at('Tổng điểm'));
    expect(paragraphs).toContain('Câu 3: Nêu đủ định nghĩa ε-δ');

    const without = await buildAnswerDocument({ ...baseSpec, guides: [] });
    const plain = (await (await readDocx(without.bytes)).part('word/document.xml')).paragraphs();
    expect(plain.some((p) => p.startsWith('Hướng dẫn chấm'))).toBe(false);
  });

  it('ký tự XML trong thông tin và đáp án được thoát đúng; tệp vẫn mở được', async () => {
    const hostile = `</w:t><w:p>X</w:p> & "Tom" <b>`;
    const { bytes } = await buildAnswerDocument({
      ...baseSpec,
      unit: hostile,
      heading: { ...baseSpec.heading, course: hostile },
      sections: [
        {
          title: hostile,
          rows: [{ number: 1, answer: hostile, points: '1', method: hostile, corrected: false }],
        },
      ],
    });
    const docx = await readDocx(bytes);
    const document = await docx.part('word/document.xml');
    expect((await docx.part('word/footer1.xml')).text()).toContain(hostile);
    expect(document.text()).toContain(`Học phần: ${hostile}`);
    expect(tablesOf(document)[1]?.[1]).toEqual(['1', hostile, '1', hostile]);
    expect(document.paragraphs().filter((p) => p === 'X')).toEqual([]);
  });
});
