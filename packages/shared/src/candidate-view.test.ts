import { describe, expect, it } from 'vitest';
import { candidateViewOf } from './candidate-view.js';
import { textDoc } from './rich-text.js';

const o = (id: string) => ({ id, content: textDoc(`Phương án ${id}`) });
const stem = textDoc('Phần dẫn');

const single = {
  type: 'single_choice' as const,
  stem,
  payload: { options: [o('a'), o('b')], key: ['a'], shuffleOptions: true },
};
const multiple = {
  type: 'multiple_choice' as const,
  stem,
  payload: {
    options: [o('a'), o('b'), o('c')],
    key: ['a', 'c'],
    shuffleOptions: false,
    scoringRule: 'proportional' as const,
  },
};
const cluster = {
  type: 'true_false_cluster' as const,
  stem,
  payload: {
    statements: [
      { id: 'a', content: textDoc('Mệnh đề a'), key: true },
      { id: 'b', content: textDoc('Mệnh đề b'), key: false },
    ],
    scoringRule: 'ladder' as const,
    ladder: [0, 0.25, 1],
  },
};
const essay = {
  type: 'essay' as const,
  stem,
  payload: { maxLength: 800, rubric: textDoc('Đáp án mẫu bí mật') },
};

const all = [single, multiple, cluster, essay];

describe('candidateViewOf (Q170): làm sạch bằng danh sách cho phép', () => {
  it('không bao giờ lộ Đáp án đúng hay hướng dẫn chấm, ở cả hai giá trị công tắc', () => {
    for (const showScoringRules of [false, true]) {
      for (const question of all) {
        const json = JSON.stringify(candidateViewOf(question, { showScoringRules }));
        expect(json, question.type).not.toContain('"key"');
        expect(json, question.type).not.toContain('rubric');
        expect(json, question.type).not.toContain('bí mật');
      }
    }
  });

  it('giữ nội dung Người dự thi cần thấy', () => {
    expect(candidateViewOf(single, { showScoringRules: false })).toEqual({
      type: 'single_choice',
      stem,
      payload: { options: [o('a'), o('b')], shuffleOptions: true },
    });
    expect(candidateViewOf(essay, { showScoringRules: false })).toEqual({
      type: 'essay',
      stem,
      payload: { maxLength: 800 },
    });
    const view = candidateViewOf(cluster, { showScoringRules: false });
    expect(view.payload).toEqual({
      statements: [
        { id: 'a', content: textDoc('Mệnh đề a') },
        { id: 'b', content: textDoc('Mệnh đề b') },
      ],
    });
  });

  it('quy tắc chấm và bậc thang chỉ hiện khi công tắc bật', () => {
    expect(candidateViewOf(multiple, { showScoringRules: false }).payload).not.toHaveProperty(
      'scoringRule',
    );
    expect(candidateViewOf(multiple, { showScoringRules: true }).payload).toMatchObject({
      scoringRule: 'proportional',
    });
    expect(candidateViewOf(cluster, { showScoringRules: true }).payload).toMatchObject({
      scoringRule: 'ladder',
      ladder: [0, 0.25, 1],
    });
  });

  it('trường lạ thêm vào payload sau này không lọt ra', () => {
    const odd = {
      ...single,
      payload: { ...single.payload, explanation: 'lời giải bí mật', answerHint: 'x' },
    };
    const json = JSON.stringify(candidateViewOf(odd, { showScoringRules: true }));
    expect(json).not.toContain('bí mật');
    expect(json).not.toContain('answerHint');
  });
});
