import { describe, expect, it } from 'vitest';
import {
  EXAM_MAX_ITEMS,
  EXAM_MAX_SECTIONS,
  type ExamContent,
  examContentSchema,
  examLayoutProblems,
} from './exam.js';
import { textDoc } from './rich-text.js';

const Q = (n: number) => `0197a6f0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, points = 1) => ({ questionId: Q(n), points });
const section = (items: { questionId: string; points: number }[], over: object = {}) => ({
  title: null,
  instructions: textDoc(''),
  items,
  ...over,
});
const exam = (over: Record<string, unknown> = {}) => ({
  title: 'Giữa kỳ Giải tích',
  instructions: textDoc('Làm bài trong 45 phút.'),
  version: 1,
  sections: [section([item(1), item(2, 0.5)])],
  ...over,
});
const ok = (value: unknown) => examContentSchema.safeParse(value).success;

describe('schema nội dung Bộ đề (Q160–Q165, Q167)', () => {
  it('nhận Bộ đề hợp lệ; tiêu đề được gọn khoảng trắng', () => {
    const parsed = examContentSchema.parse(exam({ title: '  Giữa   kỳ  ' }));
    expect(parsed.title).toBe('Giữa kỳ');
  });

  it('tiêu đề 1–200 ký tự', () => {
    expect(ok(exam({ title: '   ' }))).toBe(false);
    expect(ok(exam({ title: 'x'.repeat(200) }))).toBe(true);
    expect(ok(exam({ title: 'x'.repeat(201) }))).toBe(false);
  });

  it('có từ 1 đến 20 Phần', () => {
    expect(ok(exam({ sections: [] }))).toBe(false);
    const many = Array.from({ length: EXAM_MAX_SECTIONS }, (_, i) => section([item(i + 1)]));
    expect(ok(exam({ sections: many }))).toBe(true);
    expect(ok(exam({ sections: [...many, section([item(99)])] }))).toBe(false);
  });

  it('điểm 0,05–100, bước 0,05', () => {
    for (const points of [0.05, 0.25, 1, 100]) {
      expect(ok(exam({ sections: [section([item(1, points)])] })), String(points)).toBe(true);
    }
    for (const points of [0, 0.01, 0.07, 100.05, -1]) {
      expect(ok(exam({ sections: [section([item(1, points)])] })), String(points)).toBe(false);
    }
  });

  it('tiêu đề Phần tối đa 200 ký tự hoặc để trống (null)', () => {
    expect(ok(exam({ sections: [section([item(1)], { title: 'Phần I' })] }))).toBe(true);
    expect(ok(exam({ sections: [section([item(1)], { title: 'x'.repeat(201) })] }))).toBe(false);
  });

  it('hướng dẫn không có ảnh và tối đa 5.000 ký tự chữ', () => {
    const image = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { illustrationId: '0197a6f0-0000-7000-8000-0000000000aa', alt: 'hình' },
        },
      ],
    };
    expect(ok(exam({ instructions: image }))).toBe(false);
    expect(ok(exam({ sections: [section([item(1)], { instructions: image })] }))).toBe(false);
    expect(ok(exam({ instructions: textDoc('x'.repeat(5000)) }))).toBe(true);
    expect(ok(exam({ instructions: textDoc('x'.repeat(5001)) }))).toBe(false);
  });

  it('id Phần, nếu có, là UUID; trường lạ bị từ chối', () => {
    expect(ok(exam({ sections: [section([item(1)], { id: 'abc' })] }))).toBe(false);
    expect(ok(exam({ sections: [section([item(1)], { id: Q(500) })] }))).toBe(true);
    expect(ok(exam({ extra: 1 }))).toBe(false);
  });
});

describe('kiểm bố cục Bộ đề (Q161, Q162)', () => {
  const content = (sections: ExamContent['sections']) =>
    ({ ...examContentSchema.parse(exam()), sections }) as ExamContent;
  const withItems = (...groups: number[][]) =>
    content(
      groups.map((ids) => section(ids.map((n) => item(n))) as ExamContent['sections'][number]),
    );

  it('Bộ đề hợp lệ không có vấn đề', () => {
    expect(examLayoutProblems(withItems([1, 2], [3]))).toEqual([]);
  });

  it('một Câu hỏi xuất hiện hai lần (cùng Phần hoặc khác Phần) là lỗi, nêu vị trí lần xuất hiện sau', () => {
    expect(examLayoutProblems(withItems([1, 2, 1]))).toEqual([
      { code: 'duplicate_question', path: 'sections.0.items.2.questionId' },
    ]);
    expect(examLayoutProblems(withItems([1], [2, 1]))).toEqual([
      { code: 'duplicate_question', path: 'sections.1.items.1.questionId' },
    ]);
  });

  it('hai Phần cùng một id là lỗi, nêu vị trí lần xuất hiện sau', () => {
    const dup = content([
      { id: Q(500), title: null, instructions: textDoc(''), items: [item(1)] },
      { id: Q(500), title: null, instructions: textDoc(''), items: [item(2)] },
    ] as ExamContent['sections']);
    expect(examLayoutProblems(dup)).toEqual([{ code: 'duplicate_section', path: 'sections.1.id' }]);
  });

  it(`quá ${EXAM_MAX_ITEMS} câu là lỗi`, () => {
    const ids = Array.from({ length: EXAM_MAX_ITEMS + 1 }, (_, i) => i + 1);
    expect(examLayoutProblems(withItems(ids))).toEqual([
      { code: 'too_many_items', path: 'sections' },
    ]);
    expect(examLayoutProblems(withItems(ids.slice(0, EXAM_MAX_ITEMS)))).toEqual([]);
  });
});
