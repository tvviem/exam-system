import { normalizeForSearch, normalizeTag, TAG_MAX_CHARS } from '@exam/shared';
import type { TagCount } from './tag-facets';

// Gợi ý tag đang có khi gõ ở màn soạn, để cùng một ý không bị viết thành nhiều tag.
// Thiết kế: docs/plan/loc-nhieu-tag-thiet-ke.md mục 4.

const SUGGESTIONS = 8;

export type TagOption =
  | { kind: 'existing'; tag: string; count: number }
  | { kind: 'new'; tag: string };

/**
 * Các lựa chọn cho chữ đang gõ, lựa chọn đầu là lựa chọn mặc định (Enter). Gõ không dấu trùng đúng một tag đang có thì
 * tag đó đứng đầu; còn lại "thêm tag mới" đứng đầu, để Enter không tự đổi chữ người dùng muốn.
 */
export function suggestTags(
  all: readonly TagCount[],
  inTopic: ReadonlySet<string>,
  selected: readonly string[],
  typed: string,
): TagOption[] {
  const tag = normalizeTag(typed);
  const plain = normalizeForSearch(tag);
  const words = plain.split(' ').filter(Boolean);
  const rank = (candidate: string) => {
    const text = normalizeForSearch(candidate);
    if (candidate === tag) return 0;
    if (text === plain) return 1;
    return text.startsWith(plain) ? 2 : 3;
  };
  const existing = all
    .filter((row) => !selected.includes(row.tag))
    .filter((row) => words.every((word) => normalizeForSearch(row.tag).includes(word)))
    .sort(
      (a, b) =>
        (tag ? rank(a.tag) - rank(b.tag) : 0) ||
        Number(inTopic.has(b.tag)) - Number(inTopic.has(a.tag)) ||
        b.count - a.count ||
        a.tag.localeCompare(b.tag, 'vi'),
    )
    .slice(0, SUGGESTIONS)
    .map((row): TagOption => ({ kind: 'existing', tag: row.tag, count: row.count }));

  const known = all.some((row) => row.tag === tag) || selected.includes(tag);
  if (!tag || known || tag.length > TAG_MAX_CHARS) return existing;
  const create: TagOption = { kind: 'new', tag };
  const sameWords = existing.some((option) => normalizeForSearch(option.tag) === plain);
  return sameWords ? [...existing, create] : [create, ...existing];
}

/** Tách chữ đang gõ: các phần đã kết thúc bằng dấu phẩy thành tag, phần cuối còn đang gõ. */
export function splitTagText(text: string): { done: string[]; rest: string } {
  const parts = text.split(',');
  const rest = parts.pop() ?? '';
  return { done: parts.map(normalizeTag).filter(Boolean), rest };
}
