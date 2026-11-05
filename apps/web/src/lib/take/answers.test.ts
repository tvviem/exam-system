import { describe, expect, it } from 'vitest';
import {
  answerStateOf,
  indexesOfKind,
  isBlank,
  matchesKind,
  nextOfKind,
  progressOf,
  remainingOf,
} from './answers';

const choice = { type: 'single_choice', payload: { options: [{ id: 'a' }, { id: 'b' }] } } as const;
const many = { type: 'multiple_choice', payload: { options: [{ id: 'a' }, { id: 'b' }] } } as const;
const cluster = {
  type: 'true_false_cluster',
  payload: { statements: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
} as const;
const essay = { type: 'essay', payload: { maxLength: 500 } } as const;

describe('answerStateOf: trạng thái một câu trên lưới số câu', () => {
  it.each([
    [choice, undefined, 'blank'],
    [choice, null, 'blank'],
    [choice, { optionId: 'a' }, 'done'],
    [many, { optionIds: [] }, 'blank'],
    [many, { optionIds: ['a'] }, 'done'],
    [cluster, { answers: {} }, 'blank'],
    [cluster, { answers: { s1: true } }, 'partial'],
    [cluster, { answers: { s1: true, s2: false } }, 'partial'],
    [cluster, { answers: { s1: true, s2: false, s3: true } }, 'done'],
    [essay, { text: '' }, 'blank'],
    [essay, { text: '   \n ' }, 'blank'],
    [essay, { text: 'Bài làm' }, 'done'],
  ])('%j với %j là %s', (item, value, state) => {
    expect(answerStateOf(item, value)).toBe(state);
  });

  it('isBlank chỉ đúng khi chưa làm gì', () => {
    expect(isBlank(cluster, { answers: { s1: true } })).toBe(false);
    expect(isBlank(cluster, undefined)).toBe(true);
  });
});

describe('progressOf: đếm cho hộp thoại Nộp bài', () => {
  it('đếm câu đã làm, làm dở, chưa làm và câu đánh dấu', () => {
    const items = [
      { item: choice, response: { value: { optionId: 'a' }, flagged: false } },
      { item: cluster, response: { value: { answers: { s1: true } }, flagged: true } },
      { item: essay, response: null },
      { item: many, response: { value: { optionIds: [] }, flagged: true } },
    ];
    expect(progressOf(items)).toEqual({ done: 1, partial: 1, blank: 2, flagged: 2, total: 4 });
  });
});

describe('rà soát trước khi nộp (Q281)', () => {
  const cell = (state: 'blank' | 'partial' | 'done', flagged = false) => ({ state, flagged });
  // câu 1..8
  const cells = [
    cell('done'),
    cell('blank'),
    cell('partial'),
    cell('done', true),
    cell('blank', true),
    cell('done'),
    cell('blank'),
    cell('partial', true),
  ];

  it('matchesKind: chưa làm, làm dở và đánh dấu độc lập nhau (một câu vừa làm dở vừa đánh dấu)', () => {
    expect(cells.map((c) => matchesKind(c, 'blank'))).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(cells.map((c) => matchesKind(c, 'partial'))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(cells.map((c) => matchesKind(c, 'flagged'))).toEqual([
      false,
      false,
      false,
      true,
      true,
      false,
      false,
      true,
    ]);
  });

  it('indexesOfKind: danh sách vị trí theo thứ tự đề', () => {
    expect(indexesOfKind(cells, 'blank')).toEqual([1, 4, 6]);
    expect(indexesOfKind(cells, 'flagged')).toEqual([3, 4, 7]);
  });

  it('nextOfKind: câu kế tiếp sau vị trí hiện tại, vòng về đầu khi hết', () => {
    expect(nextOfKind(cells, 0, 'blank')).toBe(1);
    expect(nextOfKind(cells, 1, 'blank')).toBe(4);
    expect(nextOfKind(cells, 6, 'blank')).toBe(1); // vòng lại
    expect(nextOfKind(cells, 7, 'partial')).toBe(2);
  });

  it('nextOfKind: chỉ còn đúng câu đang đứng thì quay lại chính nó; không có câu nào thì null', () => {
    expect(nextOfKind([cell('blank'), cell('done')], 0, 'blank')).toBe(0);
    expect(nextOfKind([cell('done'), cell('done')], 0, 'blank')).toBeNull();
    expect(nextOfKind([], 0, 'blank')).toBeNull();
  });

  it('remainingOf: chỉ những loại còn lại (khác 0), theo thứ tự chưa làm, làm dở, đánh dấu', () => {
    expect(remainingOf({ done: 3, partial: 2, blank: 3, flagged: 3, total: 8 })).toEqual([
      { kind: 'blank', count: 3 },
      { kind: 'partial', count: 2 },
      { kind: 'flagged', count: 3 },
    ]);
    expect(remainingOf({ done: 8, partial: 0, blank: 0, flagged: 0, total: 8 })).toEqual([]);
    expect(remainingOf({ done: 6, partial: 0, blank: 1, flagged: 0, total: 7 })).toEqual([
      { kind: 'blank', count: 1 },
    ]);
  });
});
