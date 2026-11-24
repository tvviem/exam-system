import { textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import type { DraftItem, DraftSection, ExamDraft } from './exam-draft';
import { examOverviewOf } from './exam-overview';

// Thẻ tổng quan đầu trang Bộ đề đã phát hành: số liệu chung và từng Phần, cùng phép tính rút câu với server (drawSummaryOf).

const item = (n: number, points = 1): DraftItem => ({
  questionId: `q${n}`,
  points,
  question: {
    type: 'single_choice',
    preview: `Câu ${n}`,
    topicName: 'Chủ đề',
    tags: [],
    defaultPoints: points,
    archived: false,
  },
});
const section = (key: string, count: number, drawPercent: number, points = 1): DraftSection => ({
  key,
  title: key,
  instructions: textDoc(''),
  drawPercent,
  items: Array.from({ length: count }, (_, i) => item(i + 1, points)),
});
const draft = (...sections: DraftSection[]): ExamDraft => ({
  title: 'Đề',
  instructions: textDoc(''),
  sections,
});

describe('examOverviewOf: Bộ đề có rút câu', () => {
  const overview = examOverviewOf(draft(section('A', 25, 40), section('B', 25, 100)), [
    'Phần I',
    'Phần II',
  ]);
  it('tổng câu, tổng điểm của cả Bộ đề', () => {
    expect(overview.totalItems).toBe(50);
    expect(overview.totalPoints).toBe(50);
    expect(overview.sectionCount).toBe(2);
  });
  it('mỗi người nhận bao nhiêu câu và điểm; tỷ lệ rút chung', () => {
    expect(overview.drawing).toBe(true);
    expect(overview.perPerson).toEqual({ count: 35, maxPoints: 35 });
    expect(overview.overallPercent).toBe(70);
  });
  it('từng Phần: số câu có, tỷ lệ rút, số câu nhận, điểm tối đa', () => {
    expect(overview.sections).toEqual([
      { key: 'A', name: 'Phần I', total: 25, percent: 40, count: 10, points: 10 },
      { key: 'B', name: 'Phần II', total: 25, percent: 100, count: 25, points: 25 },
    ]);
  });
});

describe('examOverviewOf: làm tròn và lệch điểm', () => {
  it('rút làm tròn nửa lên (5 câu, 50 % → 3 câu); tỷ lệ chung làm tròn một chữ số lẻ', () => {
    const overview = examOverviewOf(draft(section('A', 5, 50), section('B', 2, 100)), ['I', 'II']);
    expect(overview.sections[0]).toMatchObject({ count: 3, points: 3 });
    expect(overview.perPerson.count).toBe(5);
    expect(overview.overallPercent).toBe(71.4); // 5/7
  });
  it('Phần rút dưới 100 % mà câu lệch điểm: điểm của Phần và điểm mỗi người là null (không xác định), số câu vẫn đúng', () => {
    const uneven = section('A', 4, 50);
    uneven.items[1] = item(2, 2);
    const overview = examOverviewOf(draft(uneven, section('B', 2, 100)), ['I', 'II']);
    expect(overview.sections[0]).toMatchObject({ count: 2, points: null });
    expect(overview.sections[1]).toMatchObject({ count: 2, points: 2 });
    expect(overview.perPerson).toEqual({ count: 4, maxPoints: null });
  });
  it('Phần rút 0 %: không lấy câu nào', () => {
    const overview = examOverviewOf(draft(section('A', 6, 0), section('B', 4, 100)), ['I', 'II']);
    expect(overview.sections[0]).toMatchObject({ percent: 0, count: 0, points: 0 });
    expect(overview.perPerson).toEqual({ count: 4, maxPoints: 4 });
  });
});

describe('examOverviewOf: không rút câu và Bộ đề rỗng', () => {
  it('mọi Phần 100 %: không rút, mỗi người làm đủ, tỷ lệ chung 100', () => {
    const overview = examOverviewOf(draft(section('A', 3, 100, 2), section('B', 2, 100, 3)), [
      'I',
      'II',
    ]);
    expect(overview.drawing).toBe(false);
    expect(overview.perPerson).toEqual({ count: 5, maxPoints: 12 });
    expect(overview.overallPercent).toBe(100);
    expect(overview.totalPoints).toBe(12);
  });
  it('Bộ đề không có câu nào: toàn số 0, không rút, tỷ lệ 100', () => {
    const overview = examOverviewOf(draft(section('A', 0, 100)), ['I']);
    expect(overview).toMatchObject({
      totalItems: 0,
      totalPoints: 0,
      drawing: false,
      overallPercent: 100,
      perPerson: { count: 0, maxPoints: 0 },
    });
  });
});
