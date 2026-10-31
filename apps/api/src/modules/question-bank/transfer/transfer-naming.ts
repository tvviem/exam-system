import { normalizeForSearch } from '@exam/shared';

const TOPIC_NAME_MAX = 100;
// Họ tên tối đa 200 ký tự: cắt ở đây để hậu tố không nuốt hết tên gốc (tên mới phải ≤ 100 ký tự).
const OWNER_NAME_MAX = 40;

/** Gắn `suffix` vào `base`, cắt phần `base` nếu tổng vượt giới hạn tên Chủ đề (hậu tố được giữ nguyên). */
const withSuffix = (base: string, suffix: string) =>
  `${base.slice(0, Math.max(0, TOPIC_NAME_MAX - suffix.length)).trimEnd()}${suffix}`;

/**
 * Tên Chủ đề sau khi Chuyển giao (Q148). `takenKeys` là `name_key` các Chủ đề chưa Lưu trữ của người nhận (kể cả các
 * Chủ đề vừa chuyển trước đó). Trùng thì thêm " (từ <người cho>)", vẫn trùng thì " (2)", " (3)"...
 * Không sửa `takenKeys`: người gọi tự thêm khóa của tên trả về.
 */
export function transferredTopicName(
  name: string,
  ownerName: string,
  takenKeys: ReadonlySet<string>,
): string {
  if (!takenKeys.has(normalizeForSearch(name))) return name;
  const owner = ownerName.trim().replace(/\s+/g, ' ').slice(0, OWNER_NAME_MAX).trimEnd();
  const origin = ` (từ ${owner})`;
  let candidate = withSuffix(name, origin);
  for (let n = 2; takenKeys.has(normalizeForSearch(candidate)); n++) {
    candidate = withSuffix(name, `${origin} (${n})`);
  }
  return candidate;
}
