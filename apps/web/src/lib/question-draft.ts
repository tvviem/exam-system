import {
  IMAGE_MAX_PER_QUESTION,
  imageNodesOf,
  type QuestionInput,
  type QuestionType,
  questionInputSchema,
  type RichText,
  richTextFieldsOf,
  textDoc,
} from '@exam/shared';
import type { Question } from './question-bank';

// Bản nháp trong trình soạn: giữ phần của mọi Loại câu hỏi để đổi Loại qua lại không mất dữ liệu;
// `toInput` chỉ lấy phần của Loại hiện tại.

export interface DraftOption {
  id: string;
  content: RichText;
}
export interface DraftStatement extends DraftOption {
  key: boolean;
}

export interface Draft {
  type: QuestionType;
  topicId: string;
  stem: RichText;
  defaultPoints: number;
  tags: string[];
  options: DraftOption[];
  key: string[];
  shuffleOptions: boolean;
  choiceRule: 'proportional' | 'all_or_nothing';
  statements: DraftStatement[];
  clusterRule: 'proportional' | 'all_or_nothing' | 'ladder';
  ladder: number[];
  maxLength: number;
  rubric: RichText | null;
}

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;
export const MAX_STATEMENTS = 8;

export function emptyDraft(type: QuestionType, topicId: string): Draft {
  return {
    type,
    topicId,
    stem: textDoc(''),
    defaultPoints: 1,
    tags: [],
    options: [
      { id: 'o1', content: textDoc('') },
      { id: 'o2', content: textDoc('') },
    ],
    key: [],
    shuffleOptions: true,
    choiceRule: 'proportional',
    statements: [
      { id: 's1', content: textDoc(''), key: true },
      { id: 's2', content: textDoc(''), key: false },
    ],
    clusterRule: 'proportional',
    ladder: [],
    maxLength: 2000,
    rubric: null,
  };
}

export function draftFromQuestion(question: Question): Draft {
  const draft = emptyDraft(question.type, question.topicId);
  draft.stem = question.stem;
  draft.defaultPoints = question.defaultPoints;
  draft.tags = question.tags;
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    draft.options = question.payload.options;
    draft.key = question.payload.key;
    draft.shuffleOptions = question.payload.shuffleOptions;
    if (question.type === 'multiple_choice') draft.choiceRule = question.payload.scoringRule;
  } else if (question.type === 'true_false_cluster') {
    draft.statements = question.payload.statements;
    draft.clusterRule = question.payload.scoringRule;
    draft.ladder = question.payload.ladder ?? [];
  } else {
    draft.maxLength = question.payload.maxLength;
    draft.rubric = question.payload.rubric ?? null;
  }
  return draft;
}

export function toInput(draft: Draft): QuestionInput {
  const common = {
    topicId: draft.topicId,
    stem: draft.stem,
    defaultPoints: draft.defaultPoints,
    tags: draft.tags,
  };
  switch (draft.type) {
    case 'single_choice':
      return {
        ...common,
        type: 'single_choice',
        payload: {
          options: draft.options,
          key: draft.key.slice(0, 1),
          shuffleOptions: draft.shuffleOptions,
        },
      };
    case 'multiple_choice':
      return {
        ...common,
        type: 'multiple_choice',
        payload: {
          options: draft.options,
          key: draft.key,
          scoringRule: draft.choiceRule,
          shuffleOptions: draft.shuffleOptions,
        },
      };
    case 'true_false_cluster':
      return {
        ...common,
        type: 'true_false_cluster',
        payload: {
          statements: draft.statements,
          scoringRule: draft.clusterRule,
          ...(draft.clusterRule === 'ladder' ? { ladder: draft.ladder } : {}),
        },
      };
    case 'essay':
      return {
        ...common,
        type: 'essay',
        payload: {
          maxLength: draft.maxLength,
          ...(draft.rubric ? { rubric: draft.rubric } : {}),
        },
      };
  }
}

type Problem =
  | 'topic'
  | 'stem'
  | 'options'
  | 'key'
  | 'statements'
  | 'ladder'
  | 'points'
  | 'tags'
  | 'maxLength'
  | 'math'
  | 'images';

const imageCount = (draft: Draft) =>
  richTextFieldsOf(toInput(draft)).reduce((sum, field) => sum + imageNodesOf(field.doc).length, 0);

/** Các nhóm lỗi của bản nháp (để giao diện báo bằng lời); rỗng nghĩa là lưu được. */
export function problemsOf(draft: Draft): Problem[] {
  const parsed = questionInputSchema.safeParse(toInput(draft));
  if (parsed.success) return [];
  const found = new Set<Problem>();
  for (const issue of parsed.error.issues) {
    const [first, second] = issue.path;
    // Lỗi không gắn trường nào: giới hạn số công thức hoặc số hình minh họa của cả Câu hỏi.
    if (issue.path.length === 0)
      found.add(imageCount(draft) > IMAGE_MAX_PER_QUESTION ? 'images' : 'math');
    else if (first === 'topicId') found.add('topic');
    else if (first === 'stem') found.add('stem');
    else if (first === 'defaultPoints') found.add('points');
    else if (first === 'tags') found.add('tags');
    else if (second === 'key') found.add('key');
    else if (second === 'ladder') found.add('ladder');
    else if (second === 'maxLength') found.add('maxLength');
    else if (second === 'statements') found.add('statements');
    else found.add('options');
  }
  return [...found];
}

const nextId = (prefix: string, ids: string[]) => {
  let n = 1;
  while (ids.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
};

export function addOption(draft: Draft): Draft {
  if (draft.options.length >= MAX_OPTIONS) return draft;
  const id = nextId(
    'o',
    draft.options.map((o) => o.id),
  );
  return { ...draft, options: [...draft.options, { id, content: textDoc('') }] };
}

export function removeOption(draft: Draft, id: string): Draft {
  if (draft.options.length <= MIN_OPTIONS) return draft;
  return {
    ...draft,
    options: draft.options.filter((o) => o.id !== id),
    key: draft.key.filter((k) => k !== id),
  };
}

/** Bậc thang mặc định: tăng đều từ 0 đến 1 (làm tròn 2 chữ số). */
export function defaultLadder(statementCount: number): number[] {
  return Array.from(
    { length: statementCount + 1 },
    (_, k) => Math.round((k / statementCount) * 100) / 100,
  );
}

const withLadder = (draft: Draft): Draft =>
  draft.clusterRule === 'ladder'
    ? { ...draft, ladder: defaultLadder(draft.statements.length) }
    : draft;

export function addStatement(draft: Draft): Draft {
  if (draft.statements.length >= MAX_STATEMENTS) return draft;
  const id = nextId(
    's',
    draft.statements.map((s) => s.id),
  );
  return withLadder({
    ...draft,
    statements: [...draft.statements, { id, content: textDoc(''), key: true }],
  });
}

export function removeStatement(draft: Draft, id: string): Draft {
  if (draft.statements.length <= 1) return draft;
  return withLadder({ ...draft, statements: draft.statements.filter((s) => s.id !== id) });
}
