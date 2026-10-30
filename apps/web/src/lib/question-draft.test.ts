import { type QuestionInput, textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import {
  addOption,
  addStatement,
  defaultLadder,
  draftFromQuestion,
  emptyDraft,
  problemsOf,
  removeStatement,
  toInput,
} from './question-draft';

const TOPIC = '0197a6f0-0000-7000-8000-000000000001';

const filled = (type: Parameters<typeof emptyDraft>[0]) => {
  const draft = emptyDraft(type, TOPIC);
  draft.stem = textDoc('Câu hỏi?');
  for (const option of draft.options) option.content = textDoc(`Phương án ${option.id}`);
  for (const statement of draft.statements) statement.content = textDoc(`Mệnh đề ${statement.id}`);
  draft.key = [draft.options[0]?.id ?? 'o1'];
  return draft;
};

describe('bản nháp Câu hỏi', () => {
  it('Câu mới chưa hợp lệ: thiếu Phần dẫn và nội dung Phương án', () => {
    const problems = problemsOf(emptyDraft('single_choice', TOPIC));
    expect(problems).toContain('stem');
    expect(problems).toContain('options');
  });

  it.each(['single_choice', 'multiple_choice', 'true_false_cluster', 'essay'] as const)(
    'Câu %s đã điền đủ thì hợp lệ',
    (type) => {
      expect(problemsOf(filled(type))).toEqual([]);
    },
  );

  it('chuyển bản nháp thành dữ liệu gửi lên đúng theo Loại, bỏ phần của Loại khác', () => {
    const single = toInput(filled('single_choice')) as Extract<
      QuestionInput,
      { type: 'single_choice' }
    >;
    expect(single.payload.key).toEqual(['o1']);
    expect(single.payload).not.toHaveProperty('scoringRule');

    const draft = filled('multiple_choice');
    draft.key = ['o1', 'o2'];
    const multiple = toInput(draft) as Extract<QuestionInput, { type: 'multiple_choice' }>;
    expect(multiple.payload.key).toEqual(['o1', 'o2']);
    expect(multiple.payload.scoringRule).toBe('proportional');

    // Đổi từ chọn nhiều về chọn một thì chỉ giữ đáp án đầu.
    draft.type = 'single_choice';
    const back = toInput(draft) as Extract<QuestionInput, { type: 'single_choice' }>;
    expect(back.payload.key).toEqual(['o1']);
  });

  it('nạp Câu hỏi có sẵn rồi chuyển lại cho ra đúng dữ liệu ban đầu', () => {
    const original = toInput(filled('true_false_cluster'));
    const saved = { ...original, id: 'q1', version: 3, createdAt: '', updatedAt: '' };
    expect(toInput(draftFromQuestion(saved))).toEqual(original);
    const essay = toInput({ ...filled('essay'), rubric: textDoc('Ý chính') });
    expect(
      toInput(draftFromQuestion({ ...essay, id: 'q2', version: 1, createdAt: '', updatedAt: '' })),
    ).toEqual(essay);
  });

  it('thêm Phương án tối đa 8 và đặt id chưa dùng', () => {
    const draft = emptyDraft('single_choice', TOPIC);
    draft.options = [
      { id: 'o1', content: textDoc('a') },
      { id: 'o3', content: textDoc('c') },
    ];
    const next = addOption(draft);
    expect(next.options.map((o) => o.id)).toEqual(['o1', 'o3', 'o2']);
    let many = draft;
    for (let i = 0; i < 12; i++) many = addOption(many);
    expect(many.options).toHaveLength(8);
  });

  it('Bậc thang mặc định tăng đều từ 0 đến 1 và được dựng lại khi đổi số Mệnh đề', () => {
    expect(defaultLadder(4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(defaultLadder(3)).toEqual([0, 0.33, 0.67, 1]);
    let draft = filled('true_false_cluster');
    draft.clusterRule = 'ladder';
    draft.ladder = defaultLadder(draft.statements.length);
    draft = addStatement(draft);
    expect(draft.ladder).toHaveLength(draft.statements.length + 1);
    for (const statement of draft.statements) statement.content = textDoc('Nội dung');
    draft = removeStatement(draft, draft.statements[0]?.id ?? '');
    expect(draft.ladder).toHaveLength(draft.statements.length + 1);
    expect(problemsOf(draft)).toEqual([]);
  });

  it('chưa chọn Chủ đề thì báo đúng nhóm "topic", không lẫn sang Phương án', () => {
    const draft = filled('single_choice');
    draft.topicId = '';
    expect(problemsOf(draft)).toEqual(['topic']);
  });

  it('báo thiếu đáp án và Bậc thang sai', () => {
    const draft = filled('multiple_choice');
    draft.key = [];
    expect(problemsOf(draft)).toContain('key');
    const cluster = filled('true_false_cluster');
    cluster.clusterRule = 'ladder';
    cluster.ladder = [0, 0.8, 0.2, 1];
    expect(problemsOf(cluster)).toContain('ladder');
  });
});

describe('công thức trong bản nháp', () => {
  const formulas = (count: number) => ({
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        content: Array.from({ length: count }, () => ({
          type: 'math' as const,
          attrs: { latex: 'x^2', display: false },
        })),
      },
    ],
  });

  it('Phần dẫn chỉ có công thức là hợp lệ', () => {
    const draft = filled('single_choice');
    draft.stem = formulas(3);
    expect(problemsOf(draft)).toEqual([]);
  });

  it('quá 50 công thức báo riêng là "math", không đổ lỗi cho Phương án', () => {
    const draft = filled('single_choice');
    draft.stem = formulas(51);
    expect(problemsOf(draft)).toEqual(['math']);
  });
});
