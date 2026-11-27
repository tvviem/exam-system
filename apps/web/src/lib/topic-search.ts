import { normalizeForSearch } from '@exam/shared';
import { sortTopics, type TopicLike } from './topic-tree';

// Tìm Chủ đề cho ô chọn gõ để tìm: xếp hạng, khớp chữ cái đầu, vị trí tô đậm và danh sách gợi ý khi chưa gõ.
// Thiết kế: docs/plan/hop-chon-cau-thiet-ke.md mục 3.

/** Số Chủ đề hiện khi chưa gõ, số kết quả hiện khi đang gõ, số Chủ đề dùng gần đây được nhớ. */
export const TOPIC_SUGGESTIONS = 6;
export const TOPIC_RESULTS = 20;
const TOPIC_RECENT = 3;

export interface TopicHit<T> {
  topic: T;
  /** Các đoạn khớp `[từ, đến)` tính trên tên gốc (còn dấu), để tô đậm. */
  marks: [number, number][];
}

interface Folded {
  /** Tên đã bỏ dấu, chữ thường, gộp khoảng trắng. */
  text: string;
  /** Vị trí trong tên gốc của từng ký tự trong `text`. */
  spans: [number, number][];
}

function fold(name: string): Folded {
  let text = '';
  const spans: [number, number][] = [];
  let at = 0;
  for (const char of name) {
    const end = at + char.length;
    const plain = /\s/.test(char) ? ' ' : normalizeForSearch(char);
    const last = spans.at(-1);
    // Dấu rời (chữ dạng tổ hợp) thuộc về ký tự đứng trước.
    if (!plain && last) last[1] = end;
    if (plain === ' ' && (text === '' || text.endsWith(' '))) {
      at = end;
      continue;
    }
    for (const c of plain) {
      text += c;
      spans.push([at, end]);
    }
    at = end;
  }
  return { text, spans };
}

const isWordStart = (text: string, index: number) =>
  index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1] as string);

/** Vị trí khớp của một từ, ưu tiên chỗ đầu từ. */
function findWord(text: string, word: string): { index: number; atStart: boolean } | null {
  let first = -1;
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) {
    if (isWordStart(text, i)) return { index: i, atStart: true };
    if (first < 0) first = i;
  }
  return first < 0 ? null : { index: first, atStart: false };
}

/** Hạng khớp (nhỏ là hơn) và các đoạn cần tô, hoặc null nếu không khớp. */
function match(name: string, query: string): { rank: number; marks: [number, number][] } | null {
  const { text, spans } = fold(name);
  const span = (from: number, length: number): [number, number] => [
    (spans[from] as [number, number])[0],
    (spans[from + length - 1] as [number, number])[1],
  ];

  const words = query.split(' ');
  const found = words.map((word) => findWord(text, word));
  if (found.every((hit) => hit !== null)) {
    const rank = text.startsWith(query) ? 0 : found.every((hit) => hit.atStart) ? 1 : 2;
    const marks = found
      .map((hit, k) => span(hit.index, (words[k] as string).length))
      .sort((a, b) => a[0] - b[0]);
    return { rank, marks };
  }

  const starts = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m.index);
  const letters = query.replaceAll(' ', '');
  const at = starts
    .map((i) => text[i])
    .join('')
    .indexOf(letters);
  if (at < 0) return null;
  return { rank: 3, marks: starts.slice(at, at + letters.length).map((i) => span(i, 1)) };
}

/** Các Chủ đề khớp từ khóa, hạng tốt trước, cùng hạng theo thứ tự tự nhiên; `total` đếm cả phần không hiện. */
export function searchTopics<T extends TopicLike>(
  topics: readonly T[],
  query: string,
): { hits: TopicHit<T>[]; total: number } {
  const wanted = normalizeForSearch(query);
  if (!wanted) return { hits: [], total: 0 };
  const matched = sortTopics(topics).flatMap((topic) => {
    const result = match(topic.name, wanted);
    return result ? [{ topic, ...result }] : [];
  });
  matched.sort((a, b) => a.rank - b.rank);
  return {
    hits: matched.slice(0, TOPIC_RESULTS).map(({ topic, marks }) => ({ topic, marks })),
    total: matched.length,
  };
}

/** Danh sách khi chưa gõ: Chủ đề dùng gần đây trước, thêm theo tên cho đủ số gợi ý; `hidden` là số còn lại. */
export function suggestTopics<T extends TopicLike>(
  topics: readonly T[],
  recentIds: readonly string[],
): { recent: T[]; others: T[]; hidden: number } {
  const recent = recentIds.flatMap((id) => topics.find((topic) => topic.id === id) ?? []);
  const others = sortTopics(topics.filter((topic) => !recent.includes(topic))).slice(
    0,
    TOPIC_SUGGESTIONS - recent.length,
  );
  return { recent, others, hidden: topics.length - recent.length - others.length };
}

export const rememberTopic = (recentIds: readonly string[], id: string): string[] =>
  [id, ...recentIds.filter((other) => other !== id)].slice(0, TOPIC_RECENT);
