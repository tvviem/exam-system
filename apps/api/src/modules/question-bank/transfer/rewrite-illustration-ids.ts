/**
 * Đổi `illustrationId` của các nút `image` theo bảng ánh xạ, trong bất kỳ nội dung JSON nào (Phần dẫn, Phương án,
 * Mệnh đề, hướng dẫn chấm). Trả bản mới; `changed` cho biết có nút nào bị đổi (Q149).
 */
export function rewriteIllustrationIds<T>(
  value: T,
  mapping: ReadonlyMap<string, string>,
): { value: T; changed: boolean } {
  let changed = false;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const object = node as Record<string, unknown>;
    if (object.type === 'image' && isImageAttrs(object.attrs)) {
      const next = mapping.get(object.attrs.illustrationId);
      if (next) {
        changed = true;
        return { ...object, attrs: { ...object.attrs, illustrationId: next } };
      }
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, walk(child)]));
  };
  const result = walk(value) as T;
  return { value: result, changed };
}

const isImageAttrs = (attrs: unknown): attrs is { illustrationId: string } =>
  typeof attrs === 'object' &&
  attrs !== null &&
  typeof (attrs as { illustrationId?: unknown }).illustrationId === 'string';
