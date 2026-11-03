/** Quét mọi khóa và mọi chuỗi của JSON (S8). */
export function leaks(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaks(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(['key', 'rubric', 'scoringRule', 'ladder'].includes(k) ? [`${path}.${k}`] : []),
      ...leaks(v, `${path}.${k}`),
    ]);
  }
  if (typeof value === 'string' && value.includes('ε-δ')) return [`${path} (rubric)`];
  return [];
}
