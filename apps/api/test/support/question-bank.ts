import { type QuestionInput, textDoc } from '@exam/shared';

/** Câu chọn một hợp lệ; `over` ghi đè từng trường. */
export function singleChoice(
  topicId: string,
  over: { stem?: string; tags?: string[]; defaultPoints?: number } = {},
): QuestionInput {
  const { stem, ...rest } = over;
  return {
    type: 'single_choice',
    topicId,
    stem: textDoc(stem ?? 'Đạo hàm của x² là gì?'),
    defaultPoints: 1,
    tags: [],
    payload: {
      options: [
        { id: 'o1', content: textDoc('x') },
        { id: 'o2', content: textDoc('2x') },
        { id: 'o3', content: textDoc('x²') },
      ],
      key: ['o2'],
      shuffleOptions: true,
    },
    ...rest,
  } as QuestionInput;
}

export const multipleChoice = (topicId: string): QuestionInput => ({
  type: 'multiple_choice',
  topicId,
  stem: textDoc('Chọn các số nguyên tố'),
  defaultPoints: 2,
  tags: ['số học'],
  payload: {
    options: [
      { id: 'o1', content: textDoc('2') },
      { id: 'o2', content: textDoc('4') },
      { id: 'o3', content: textDoc('7') },
    ],
    key: ['o1', 'o3'],
    scoringRule: 'proportional',
    shuffleOptions: true,
  },
});

export const cluster = (topicId: string): QuestionInput => ({
  type: 'true_false_cluster',
  topicId,
  stem: textDoc('Xét hàm số f(x) = x³'),
  defaultPoints: 1,
  tags: [],
  payload: {
    statements: [
      { id: 's1', content: textDoc('f đồng biến trên R'), key: true },
      { id: 's2', content: textDoc('f có cực trị'), key: false },
    ],
    scoringRule: 'ladder',
    ladder: [0, 0.25, 1],
  },
});

export const essay = (topicId: string): QuestionInput => ({
  type: 'essay',
  topicId,
  stem: textDoc('Trình bày định nghĩa giới hạn'),
  defaultPoints: 5,
  tags: [],
  payload: { maxLength: 1000, rubric: textDoc('Nêu đủ định nghĩa ε-δ') },
});
