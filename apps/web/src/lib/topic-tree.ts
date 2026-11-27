import { normalizeForSearch } from '@exam/shared';

// Gom Chủ đề thành nhóm theo phần đầu của tên (trước " - "), chỉ để hiển thị: Chủ đề vẫn là danh sách phẳng (Q112).
// Thiết kế: docs/plan/chu-de-ux-thiet-ke.md mục 4.1.

export interface TopicLike {
  id: string;
  name: string;
  questionCount?: number;
}

export interface TopicGroup<T extends TopicLike> {
  /** Khóa không dấu của tên nhóm, ổn định để nhớ mở hay đóng. */
  key: string;
  name: string;
  /** Tổng số câu của các Chủ đề đang hiện trong nhóm. */
  questionCount: number;
  /** `label` là phần tên còn lại sau tên nhóm. */
  items: { topic: T; label: string }[];
}

export interface TopicTree<T extends TopicLike> {
  groups: TopicGroup<T>[];
  /** Chủ đề không thuộc nhóm nào. */
  singles: T[];
}

const SEPARATOR = ' - ';

const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

/** Thứ tự tự nhiên tiếng Việt: "Chương 2" trước "Chương 10". */
export const compareTopicNames = (a: string, b: string): number => collator.compare(a, b);

export const sortTopics = <T extends TopicLike>(topics: readonly T[]): T[] =>
  [...topics].sort((a, b) => compareTopicNames(a.name, b.name));

export function splitTopicName(name: string): { prefix: string; rest: string } | null {
  const at = name.indexOf(SEPARATOR);
  if (at < 0) return null;
  const prefix = name.slice(0, at).trim();
  const rest = name.slice(at + SEPARATOR.length).trim();
  return prefix && rest ? { prefix, rest } : null;
}

/** "CTDL 3" → "CTDL": phần đầu bỏ số thứ tự đứng cuối. */
const withoutNumber = (prefix: string): string => /^(.*\S)\s+\d+$/.exec(prefix)?.[1] ?? prefix;

interface Member<T> {
  topic: T;
  label: string;
  /** Tên nhóm mà Chủ đề này góp vào, giữ nguyên chữ hoa thường. */
  base: string;
}

function bucket<T>(members: Member<T>[]): Map<string, Member<T>[]> {
  const buckets = new Map<string, Member<T>[]>();
  for (const member of members) {
    const key = normalizeForSearch(member.base);
    buckets.set(key, [...(buckets.get(key) ?? []), member]);
  }
  return buckets;
}

const countOf = <T extends TopicLike>(items: { topic: T }[]) =>
  items.reduce((sum, item) => sum + (item.topic.questionCount ?? 0), 0);

/**
 * Lượt 1: các Chủ đề cùng phần đầu (không phân biệt hoa thường và dấu), từ hai trở lên, thành một nhóm. Lượt 2: những
 * Chủ đề còn lẻ có phần đầu chỉ khác số cuối ("CTDL 1", "CTDL 2") vào nhóm theo phần chữ, nhãn giữ lại số.
 */
export function groupTopics<T extends TopicLike>(topics: readonly T[]): TopicTree<T> {
  const singles: T[] = [];
  const prefixed: (Member<T> & { numberedBase: string })[] = [];
  for (const topic of sortTopics(topics)) {
    const parts = splitTopicName(topic.name);
    if (!parts) singles.push(topic);
    else
      prefixed.push({
        topic,
        label: parts.rest,
        base: parts.prefix,
        numberedBase: withoutNumber(parts.prefix),
      });
  }

  const groups = new Map<string, Member<T>[]>();
  const leftovers: Member<T>[] = [];
  const exact = bucket(prefixed);
  for (const [key, members] of exact) if (members.length > 1) groups.set(key, members);
  for (const member of prefixed) {
    if (groups.has(normalizeForSearch(member.base))) continue;
    const base = member.numberedBase;
    leftovers.push(
      base === member.base
        ? member
        : { topic: member.topic, base, label: member.topic.name.slice(base.length).trim() },
    );
  }
  for (const [key, members] of bucket(leftovers)) {
    const existing = groups.get(key);
    if (existing) groups.set(key, [...existing, ...members]);
    else if (members.length > 1) groups.set(key, members);
    else singles.push(...members.map((m) => m.topic));
  }

  return {
    groups: [...groups]
      .map(([key, members]) => {
        const items = members
          .map(({ topic, label }) => ({ topic, label }))
          .sort((a, b) => compareTopicNames(a.label, b.label));
        const name = (members[0] as Member<T>).base;
        return { key, name, questionCount: countOf(items), items };
      })
      .sort((a, b) => compareTopicNames(a.name, b.name)),
    singles: sortTopics(singles),
  };
}

/** Giữ các Chủ đề khớp mọi từ trong từ khóa (không dấu, không cần đúng thứ tự); nhóm không còn Chủ đề thì bỏ. */
export function filterTopicTree<T extends TopicLike>(
  tree: TopicTree<T>,
  query: string,
): TopicTree<T> {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return tree;
  const matches = (topic: T) => {
    const name = normalizeForSearch(topic.name);
    return words.every((word) => name.includes(word));
  };
  return {
    groups: tree.groups.flatMap((group) => {
      const items = group.items.filter((item) => matches(item.topic));
      return items.length > 0 ? [{ ...group, items, questionCount: countOf(items) }] : [];
    }),
    singles: tree.singles.filter(matches),
  };
}

/** Các Chủ đề theo đúng thứ tự đang hiện: trong nhóm trước, Chủ đề lẻ sau. */
export const flattenTopicTree = <T extends TopicLike>(tree: TopicTree<T>): T[] => [
  ...tree.groups.flatMap((group) => group.items.map((item) => item.topic)),
  ...tree.singles,
];
