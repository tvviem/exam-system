import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../common/exam-content';
import { toAnswerSpec } from './paper-answer-spec';

const rt = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

let counter = 0;
const item = (
  type: ContentItem['snapshot']['type'],
  payload: Record<string, unknown>,
  points = 1,
  sectionId = 's1',
): ContentItem => ({
  itemId: `i${++counter}`,
  sectionId,
  points,
  snapshot: { questionId: `q${counter}`, type, stem: rt('Nội dung'), payload, illustrations: [] },
});

const options = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, content: rt(`PA ${i + 1}`) }));

const exam = (...items: ContentItem[]) => ({
  content: {
    examId: 'e1',
    title: 'Giữa kỳ Giải tích',
    instructions: rt(''),
    sections: [{ id: 's1', title: null, instructions: rt(''), drawPercent: 100, items }],
  },
  correctedItemIds: [] as string[],
});

const request = { course: 'Giải tích 1' };
const spec = (source: ReturnType<typeof exam>) =>
  toAnswerSpec({ ...source, session: null, unitName: 'Khoa Kỹ thuật và Công nghệ', request });
const rows = (source: ReturnType<typeof exam>) => spec(source).sections[0]?.rows ?? [];

describe('toAnswerSpec: từ đáp án hiệu lực sang dữ liệu dựng tệp Đáp án', () => {
  it('khung giống tệp Đề (cùng trường, Đơn vị, Mã đề); câu chọn một ghi chữ cái đáp án theo thứ tự gốc, kèm điểm', () => {
    const result = spec(exam(item('single_choice', { options: options(4), key: ['o2'] }, 1)));

    expect(result.school).toBe('Trường Đại học Bạc Liêu');
    expect(result.unit).toBe('Khoa Kỹ thuật và Công nghệ');
    expect(result.examCode).toBe('đề chuẩn');
    expect(result.heading.examName).toBe('Giữa kỳ Giải tích');
    expect(result.heading.course).toBe('Giải tích 1');
    expect(result.sections[0]?.rows).toEqual([
      { number: 1, answer: 'B', points: '1', method: '', corrected: false },
    ]);
    expect(result.totalPoints).toBe('1');
  });

  it('chọn nhiều ghi các chữ cái đúng theo thứ tự gốc; cách chấm theo quy tắc của câu', () => {
    const proportional = item(
      'multiple_choice',
      { options: options(4), key: ['o3', 'o1'], scoringRule: 'proportional' },
      2,
    );
    const allOrNothing = item(
      'multiple_choice',
      { options: options(4), key: ['o2', 'o4'], scoringRule: 'all_or_nothing' },
      2,
    );
    const [first, second] = rows(exam(proportional, allOrNothing));

    expect(first).toMatchObject({ answer: 'A, C', method: 'Theo tỉ lệ số ý đúng' });
    expect(second).toMatchObject({ answer: 'B, D', method: 'Đúng hết mới có điểm' });
  });

  it('chùm đúng/sai ghi từng Mệnh đề Đúng hoặc Sai; thang bậc ghi tỉ lệ điểm theo số ý đúng', () => {
    const cluster = (extra: Record<string, unknown>) =>
      item('true_false_cluster', {
        statements: [
          { id: 's1', content: rt('A'), key: true },
          { id: 's2', content: rt('B'), key: false },
          { id: 's3', content: rt('C'), key: true },
        ],
        ...extra,
      });
    const [ladder, proportional, strict] = rows(
      exam(
        cluster({ scoringRule: 'ladder', ladder: [0, 0.1, 0.25, 1] }),
        cluster({ scoringRule: 'proportional' }),
        cluster({ scoringRule: 'all_or_nothing' }),
      ),
    );

    expect(ladder?.answer).toBe('a) Đúng; b) Sai; c) Đúng');
    expect(ladder?.method).toBe(
      'Theo bậc: đúng 1 ý được 10%, đúng 2 ý được 25%, đúng 3 ý được 100%',
    );
    expect(proportional?.method).toBe('Theo tỉ lệ số ý đúng');
    expect(strict?.method).toBe('Đúng hết mới có điểm');
  });

  it('tự luận trỏ sang hướng dẫn chấm, nguyên văn ở cuối tệp; điểm viết dấu phẩy, tổng cộng đúng', () => {
    const rubric = rt('Nêu đủ định nghĩa ε-δ');
    const result = spec(
      exam(
        item('single_choice', { options: options(2), key: ['o1'] }, 0.5),
        item('essay', { maxLength: 500, rubric }, 2.25),
        item('essay', { maxLength: 500 }, 1),
      ),
    );

    expect(result.sections[0]?.rows.map((row) => [row.answer, row.points])).toEqual([
      ['A', '0,5'],
      ['Xem hướng dẫn chấm', '2,25'],
      ['Xem hướng dẫn chấm', '1'],
    ]);
    expect(result.totalPoints).toBe('3,75');
    // câu có hướng dẫn chấm được liệt kê theo số câu; câu tự luận không có hướng dẫn thì bỏ
    expect(result.guides).toEqual([{ number: 2, rubric }]);
  });

  it('số câu đánh liên tục qua các Phần; Phần không tiêu đề có title null; câu đã Đính chính được đánh dấu', () => {
    const a = item('single_choice', { options: options(3), key: ['o1'] }, 1, 's1');
    const b = item('single_choice', { options: options(3), key: ['o3'] }, 1, 's2');
    const result = toAnswerSpec({
      content: {
        examId: 'e1',
        title: 'Đề',
        instructions: rt(''),
        sections: [
          { id: 's1', title: '  ', instructions: rt(''), drawPercent: 100, items: [a] },
          { id: 's2', title: 'PHẦN II', instructions: rt(''), drawPercent: 100, items: [b] },
        ],
      },
      correctedItemIds: [b.itemId],
      session: null,
      unitName: null,
      request,
    });

    expect(result.sections.map((section) => section.title)).toEqual([null, 'PHẦN II']);
    expect(result.sections.map((section) => section.rows.map((row) => row.number))).toEqual([
      [1],
      [2],
    ]);
    expect(result.sections[0]?.rows[0]?.corrected).toBe(false);
    expect(result.sections[1]?.rows[0]).toMatchObject({ answer: 'C', corrected: true });
  });
});
