import { describe, expect, it } from 'vitest';
import { drawTotalsOfContent, type ExamContentData } from './exam-content';

const item = (itemId: string, sectionId: string, points: number) => ({
  itemId,
  sectionId,
  points,
  snapshot: {
    questionId: itemId,
    type: 'essay' as const,
    stem: {},
    payload: {},
    illustrations: [],
  },
});
const content: ExamContentData = {
  examId: 'e',
  title: 'Đề',
  instructions: {},
  sections: [
    {
      id: 's1',
      title: null,
      instructions: {},
      drawPercent: 50,
      items: [item('a', 's1', 2), item('b', 's1', 1)],
    },
    { id: 's2', title: null, instructions: {}, drawPercent: 100, items: [item('c', 's2', 1)] },
  ],
};

describe('drawTotalsOfContent: số câu và điểm tối đa mỗi Người dự thi nhận', () => {
  it('mỗi người một bộ câu: theo tỷ lệ hiệu lực (Phần rút giả định cùng điểm: 1 câu × điểm câu đầu)', () => {
    expect(drawTotalsOfContent(content, {})).toEqual({ count: 2, maxCenti: 300 }); // 1 câu × 2 điểm + 1 điểm
  });

  it('dùng chung Mã đề: lấy đúng tổng của Mã đề, kể cả khi các câu trong Phần lệch điểm', () => {
    // Mã đề chọn câu 'b' (1 điểm) của Phần 1 và câu 'c': tổng 2 điểm, không phải 3 như công thức theo tỷ lệ.
    expect(drawTotalsOfContent(content, {}, { count: 2, maxCenti: 200 })).toEqual({
      count: 2,
      maxCenti: 200,
    });
  });

  it('variantTotals null: như cũ', () => {
    expect(drawTotalsOfContent(content, {}, null)).toEqual(drawTotalsOfContent(content, {}));
  });
});
