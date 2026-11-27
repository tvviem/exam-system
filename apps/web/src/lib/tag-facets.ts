import { compareTags, LEVEL_KIND, normalizeForSearch, tagKind } from '@exam/shared';

// Danh sách tag để bấm chọn: gom theo loại, tìm không dấu, thu gọn nhóm "khác".
// Thiết kế: docs/plan/loc-nhieu-tag-thiet-ke.md mục 3, hop-chon-cau-thiet-ke.md mục 4.

/** Số tag nhóm "khác" hiện khi chưa mở rộng, và số kết quả nhiều nhất khi đang tìm. */
export const OTHER_TAGS_SHOWN = 8;
const OTHER_TAGS_FOUND = 50;

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagFacetItem extends TagCount {
  selected: boolean;
}

export interface TagFacetGroup {
  /** Tên loại; `null` là nhóm "khác". */
  kind: string | null;
  items: TagFacetItem[];
  /** Số tag chưa hiện trong nhóm. */
  hidden: number;
}

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

export function tagFacets(
  counts: readonly TagCount[],
  selected: readonly string[],
  query: string,
  expanded: boolean,
): TagFacetGroup[] {
  // Tag đã chọn mà không còn câu nào (vừa đổi Chủ đề) vẫn phải bỏ chọn được.
  const missing = selected.filter((tag) => !counts.some((row) => row.tag === tag));
  const all: TagFacetItem[] = [...counts, ...missing.map((tag) => ({ tag, count: 0 }))].map(
    (row) => ({ ...row, selected: selected.includes(row.tag) }),
  );

  const sizes = new Map<string, number>();
  for (const item of all) {
    const kind = tagKind(item.tag);
    if (kind !== null) sizes.set(kind, (sizes.get(kind) ?? 0) + 1);
  }
  // Loại chỉ có một tag thì không đáng một nhóm riêng (trừ mức độ).
  const groupOf = (tag: string) => {
    const kind = tagKind(tag);
    return kind !== null && (kind === LEVEL_KIND || (sizes.get(kind) ?? 0) > 1) ? kind : null;
  };

  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  const matches = (item: TagFacetItem) => {
    const text = normalizeForSearch(item.tag);
    return item.selected || words.every((word) => text.includes(word));
  };

  const groups = new Map<string | null, TagFacetItem[]>();
  for (const item of all.filter(matches)) {
    const kind = groupOf(item.tag);
    groups.set(kind, [...(groups.get(kind) ?? []), item]);
  }

  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : collator.compare(a, b)))
    .map(([kind, items]) => {
      if (kind !== null) {
        return { kind, items: items.sort((a, b) => compareTags(a.tag, b.tag)), hidden: 0 };
      }
      items.sort((a, b) => b.count - a.count || compareTags(a.tag, b.tag));
      const limit =
        words.length > 0 ? OTHER_TAGS_FOUND : expanded ? items.length : OTHER_TAGS_SHOWN;
      const shown = items.filter((item, index) => index < limit || item.selected);
      return { kind, items: shown, hidden: items.length - shown.length };
    });
}
