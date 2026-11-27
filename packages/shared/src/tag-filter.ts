// Lọc theo nhiều tag (docs/plan/loc-nhieu-tag-thiet-ke.md mục 2): loại của tag suy từ chính chữ của tag, không lưu thêm gì.
// API dựng điều kiện truy vấn và web viết dòng "Đang lọc" từ cùng các hàm này.

/** Số tag tối đa chọn một lần (Q521). */
export const TAG_FILTER_MAX = 20;

export const TAG_MATCHES = ['all', 'any'] as const;
export type TagMatch = (typeof TAG_MATCHES)[number];

/** Bốn mức độ nhận thức quen dùng khi ra đề, xếp từ thấp tới cao; cùng một loại (Q528). */
export const LEVEL_TAGS = ['nhận biết', 'thông hiểu', 'vận dụng', 'vận dụng cao'] as const;
export const LEVEL_KIND = 'mức độ';

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** Thứ tự tự nhiên tiếng Việt; riêng các mức độ theo thứ tự từ thấp tới cao. */
export function compareTags(a: string, b: string): number {
  const level = (tag: string) => (LEVEL_TAGS as readonly string[]).indexOf(tag.normalize('NFC'));
  const [x, y] = [level(a), level(b)];
  return x >= 0 && y >= 0 ? x - y : collator.compare(a, b);
}

/** Loại của tag: `loại: giá trị`, phần chữ đứng trước số cuối, hay mức độ; `null` nếu tag không thuộc loại nào. */
export function tagKind(tag: string): string | null {
  const text = tag.normalize('NFC');
  if ((LEVEL_TAGS as readonly string[]).includes(text)) return LEVEL_KIND;
  const colon = text.indexOf(':');
  if (colon >= 0) {
    const kind = text.slice(0, colon).trim();
    return kind && text.slice(colon + 1).trim() ? kind : null;
  }
  return /^(.*\S)\s+\d+(?:\.\d+)*$/.exec(text)?.[1] ?? null;
}

/**
 * Điều kiện lọc dạng "và của các hoặc": câu khớp khi mỗi nhóm có ít nhất một tag của nó. `all`: tag cùng loại chung một
 * nhóm, mỗi tag không loại một nhóm; `any`: mọi tag chung một nhóm.
 */
export function tagGroups(tags: readonly string[], match: TagMatch): string[][] {
  if (tags.length === 0) return [];
  if (match === 'any') return [[...tags].sort(compareTags)];
  const groups = new Map<string, string[]>();
  for (const tag of tags) {
    const kind = tagKind(tag);
    // Khóa của loại và của tag lẻ tách nhau để tag "chương" không nhập vào loại "chương".
    const key = kind === null ? `tag ${tag}` : `kind ${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  return [...groups.values()].map((group) => group.sort(compareTags));
}

export function describeTagFilter(tags: readonly string[], match: TagMatch): string {
  const groups = tagGroups(tags, match);
  return groups
    .map((group) => {
      const text = group.join(' hoặc ');
      return group.length > 1 && groups.length > 1 ? `(${text})` : text;
    })
    .join(' và ');
}
