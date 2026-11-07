import type { ContentItem } from '../../common/exam-content';

// Đáp án đúng của một câu và việc thay bằng đáp án đã đính chính (Q302, Q320). Hàm thuần.

/** Dạng `KeyOverride` của `@exam/scoring`: id Phương án đúng, hoặc giá trị đúng/sai của từng Mệnh đề. */
export type Key = string[] | Record<string, boolean>;

type Judged = Pick<ContentItem['snapshot'], 'type' | 'payload'>;
type Option = { id: string };
type Statement = { id: string; key: boolean };

/** Đáp án hiện có trong bản chụp (hoặc đã chồng bản đính chính); `null` với câu tự luận hay dữ liệu hỏng. */
export function keyOf(item: Judged): Key | null {
  if (item.type === 'single_choice' || item.type === 'multiple_choice') {
    const key = item.payload.key;
    return Array.isArray(key) ? key.filter((id): id is string => typeof id === 'string') : null;
  }
  if (item.type === 'true_false_cluster') {
    const statements = item.payload.statements as Statement[] | undefined;
    if (!Array.isArray(statements)) return null;
    return Object.fromEntries(statements.map((s) => [s.id, s.key === true]));
  }
  return null;
}

/** Lý do `key` không dùng được làm đáp án của câu này, hoặc `null` nếu hợp lệ. */
export function keyProblem(item: Judged, key: Key): string | null {
  if (item.type === 'essay') return 'essay_has_no_key';
  if (item.type === 'true_false_cluster') {
    if (Array.isArray(key)) return 'key_wrong_shape';
    const statements = (item.payload.statements as Statement[] | undefined) ?? [];
    const ids = new Set(statements.map((s) => s.id));
    const given = Object.keys(key);
    // Đủ và chỉ gồm các Mệnh đề của chùm.
    if (given.length !== ids.size || given.some((id) => !ids.has(id))) return 'key_statements';
    return null;
  }
  if (!Array.isArray(key)) return 'key_wrong_shape';
  const options = new Set(((item.payload.options as Option[] | undefined) ?? []).map((o) => o.id));
  if (new Set(key).size !== key.length || key.some((id) => !options.has(id))) {
    return 'key_unknown_option';
  }
  if (item.type === 'single_choice' && key.length !== 1) return 'key_single_needs_one';
  return null;
}

/** Bản sao của câu với đáp án thay bằng `key` (không sửa bản gốc). */
export function withKey(item: ContentItem, key: Key): ContentItem {
  const payload = { ...item.snapshot.payload };
  if (item.snapshot.type === 'true_false_cluster' && !Array.isArray(key)) {
    const statements = (payload.statements as Statement[] | undefined) ?? [];
    payload.statements = statements.map((s) => ({ ...s, key: key[s.id] ?? s.key }));
  } else if (Array.isArray(key)) {
    payload.key = [...key];
  }
  return { ...item, snapshot: { ...item.snapshot, payload } };
}
