import { z } from 'zod';

// Luật thuần của Lượt làm bài, dùng chung cho api và (sau này) giao diện (docs/plan/slice-4.md, Q199, Q208, Q215, Q230).

/** Câu trả lời được nhận đến `deadline` cộng ân hạn này (Q212); quá nữa thì Lượt bị đóng với lý do hết giờ. */
export const ATTEMPT_GRACE_SECONDS = 30;
/** Bật Cắt cứng mà còn dưới số giây này đến giờ đóng thì không cho bắt đầu Lượt mới (Q230). */
export const HARD_CLOSE_MIN_SECONDS = 60;

export interface DeadlineInput {
  startedAt: Date;
  durationMinutes: number;
  /** Phút cộng sẵn cho riêng người này (Danh sách dự thi). */
  extraMinutes: number;
  hardClose: boolean;
  closesAt: Date;
}

/** Hạn nộp: bắt đầu + Thời lượng + giờ cộng sẵn; bật Cắt cứng thì không quá giờ đóng Khung giờ (Q208). */
export function deadlineOf(input: DeadlineInput): Date {
  const plain = input.startedAt.getTime() + (input.durationMinutes + input.extraMinutes) * 60_000;
  return new Date(input.hardClose ? Math.min(plain, input.closesAt.getTime()) : plain);
}

// --- Bố cục (thứ tự câu và Phương án), cố định theo hạt giống (Q199) ---

export interface LayoutItemInput {
  itemId: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false_cluster' | 'essay';
  /** Id Phương án (chọn một, chọn nhiều) hoặc Mệnh đề (chùm đúng/sai) theo thứ tự gốc. */
  optionIds: string[];
  /** Cờ `shuffleOptions` của chính Câu hỏi. */
  shuffleOptions: boolean;
}

export interface LayoutInput {
  sections: { sectionId: string; items: LayoutItemInput[] }[];
}

export interface Layout {
  sections: { sectionId: string; items: { itemId: string; optionOrder?: string[] }[] }[];
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32); hạt giống 48 bit được trộn xuống 32 bit. */
function prng(seed: number): () => number {
  let state = ((seed % 2 ** 32) ^ (Math.floor(seed / 2 ** 32) * 0x9e3779b1)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * Bố cục của một Lượt. Công tắc Phiên thi tắt thì giữ nguyên; bật thì xáo câu trong từng Phần (không xáo Phần) và
 * Phương án của câu chọn một, chọn nhiều có cờ `shuffleOptions`. Mệnh đề của chùm đúng/sai không xáo (Q215).
 */
export function layoutOf(
  seed: number,
  input: LayoutInput,
  flags: { shuffleItems: boolean; shuffleOptions: boolean },
): Layout {
  const random = prng(seed);
  return {
    sections: input.sections.map((section) => {
      const items = flags.shuffleItems ? shuffled(section.items, random) : section.items;
      return {
        sectionId: section.sectionId,
        items: items.map((item) => {
          const choice = item.type === 'single_choice' || item.type === 'multiple_choice';
          return flags.shuffleOptions && choice && item.shuffleOptions
            ? { itemId: item.itemId, optionOrder: shuffled(item.optionIds, random) }
            : { itemId: item.itemId };
        }),
      };
    }),
  };
}

// --- Hình dạng Câu trả lời theo Loại (kiểm theo bản chụp, id không có thật bị từ chối) ---

type Ids = { id: string }[];
export type ResponseSource =
  | { type: 'single_choice' | 'multiple_choice'; payload: { options: Ids } }
  | { type: 'true_false_cluster'; payload: { statements: Ids } }
  | { type: 'essay'; payload: { maxLength: number } };

const oneOf = (ids: string[]) => z.string().refine((value) => ids.includes(value));

/** Schema Zod của `value` một Câu trả lời. `null` (bỏ trả lời) hợp lệ với chọn một. */
export function responseSchemaFor(item: ResponseSource): z.ZodType<unknown> {
  switch (item.type) {
    case 'single_choice': {
      const ids = item.payload.options.map((option) => option.id);
      return z.union([z.null(), z.strictObject({ optionId: oneOf(ids) })]);
    }
    case 'multiple_choice': {
      const ids = item.payload.options.map((option) => option.id);
      return z.strictObject({
        optionIds: z
          .array(oneOf(ids))
          .max(ids.length)
          .refine((list) => new Set(list).size === list.length),
      });
    }
    case 'true_false_cluster': {
      const ids = item.payload.statements.map((statement) => statement.id);
      return z.strictObject({
        answers: z
          .record(z.string(), z.boolean())
          .refine((answers) => Object.keys(answers).every((key) => ids.includes(key))),
      });
    }
    case 'essay':
      return z.strictObject({ text: z.string().max(item.payload.maxLength) });
  }
}
