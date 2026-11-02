import { describe, expect, it } from 'vitest';
import { answerStateOf, isBlank, progressOf } from './answers';

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
