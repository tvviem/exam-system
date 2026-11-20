import type { QuestionType } from '@exam/shared';
import type { ContentItem, ExamContentData } from '../../common/exam-content';
import type { PaperHeading } from './paper-document';
import { isBlank, type PaperRequest, paperFrameOf, type SessionTimes } from './paper-spec';

/** Một dòng của bảng đáp án. */
export interface AnswerRow {
  number: number;
  answer: string;
  /** Điểm của câu, đã định dạng ("1", "0,5"). */
  points: string;
  /** Cách chấm của câu nhiều ý ("" nếu không cần ghi). */
  method: string;
  /** Câu đã được Đính chính đáp án. */
  corrected: boolean;
}

export interface AnswerSpec {
  school: string;
  unit: string;
  examCode: string;
  heading: PaperHeading;
  sections: { title: string | null; rows: AnswerRow[] }[];
  totalPoints: string;
  /** Hướng dẫn chấm của các câu tự luận có hướng dẫn, theo số câu. */
  guides: { number: number; rubric: unknown }[];
}

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SEE_GUIDE = 'Xem hướng dẫn chấm';

/** Số theo cách viết Việt Nam: dấu phẩy thập phân, bỏ số 0 thừa, tối đa hai chữ số lẻ. */
const decimal = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');
const percent = (rate: number) => `${String(Math.round(rate * 1000) / 10).replace('.', ',')}%`;

type Payload = Record<string, unknown>;
type Description = { answer: string; method: string };

/** Cách chấm của câu nhiều ý: thang bậc (ladder), tỉ lệ số ý đúng (mặc định), hoặc đúng hết mới có điểm. */
function methodOf(payload: Payload): string {
  if (payload.scoringRule === 'all_or_nothing') return 'Đúng hết mới có điểm';
  const ladder = payload.ladder;
  if (payload.scoringRule === 'ladder' && Array.isArray(ladder)) {
    const steps = ladder
      .slice(1)
      .map((rate, index) => `đúng ${index + 1} ý được ${percent(Number(rate))}`);
    return `Theo bậc: ${steps.join(', ')}`;
  }
  return 'Theo tỉ lệ số ý đúng';
}

const choiceAnswer = (payload: Payload): string => {
  const options = (payload.options as { id: string }[] | undefined) ?? [];
  const key = (payload.key as string[] | undefined) ?? [];
  return options
    .map((option, index) => (key.includes(option.id) ? LABELS[index] : null))
    .filter(Boolean)
    .join(', ');
};

/**
 * Đáp án và cách chấm của từng Loại. Bắt buộc đủ mọi Loại (kiểu `Record`): thêm Loại mới vào `@exam/shared` mà quên ở đây thì không
 * biên dịch được.
 */
const DESCRIBE: Record<QuestionType, (payload: Payload) => Description> = {
  single_choice: (payload) => ({ answer: choiceAnswer(payload), method: '' }),
  multiple_choice: (payload) => ({ answer: choiceAnswer(payload), method: methodOf(payload) }),
  true_false_cluster: (payload) => ({
    answer: ((payload.statements as { key: boolean }[] | undefined) ?? [])
      .map(
        (statement, index) =>
          `${String.fromCharCode(97 + index)}) ${statement.key === true ? 'Đúng' : 'Sai'}`,
      )
      .join('; '),
    method: methodOf(payload),
  }),
  essay: () => ({ answer: SEE_GUIDE, method: '' }),
};

const describe = (entry: ContentItem): Description =>
  (DESCRIBE[entry.snapshot.type] as ((payload: Payload) => Description) | undefined)?.(
    entry.snapshot.payload,
  ) ?? { answer: '', method: '' };

export function toAnswerSpec(input: {
  content: ExamContentData;
  correctedItemIds: string[];
  session: SessionTimes | null;
  unitName: string | null;
  request: PaperRequest;
}): AnswerSpec {
  const { content, correctedItemIds } = input;
  const corrected = new Set(correctedItemIds);
  const guides: AnswerSpec['guides'] = [];
  let number = 0;
  let total = 0;
  const sections = content.sections.map((section) => ({
    title: section.title?.trim() ? section.title : null,
    rows: section.items.map((entry): AnswerRow => {
      number += 1;
      total += entry.points;
      const rubric = entry.snapshot.payload.rubric;
      if (entry.snapshot.type === 'essay' && rubric && !isBlank(rubric)) {
        guides.push({ number, rubric });
      }
      return {
        number,
        ...describe(entry),
        points: decimal(entry.points),
        corrected: corrected.has(entry.itemId),
      };
    }),
  }));
  return { ...paperFrameOf(input), sections, totalPoints: decimal(total), guides };
}
