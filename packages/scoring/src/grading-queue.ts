import type { Verdict } from './score-response.js';

// Hàng đợi chấm tay (docs/plan/slice-5.md, Q290–Q292): hàm thuần dùng ở server.

/**
 * Băm chuỗi ổn định (cyrb53, 53 bit): cùng chuỗi luôn ra cùng số, ở mọi máy. Không dùng cho bảo mật; chỉ để xếp thứ tự
 * ngẫu nhiên nhưng cố định.
 */
export function stableHash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Xếp thứ tự "ngẫu nhiên nhưng cố định" theo băm của `salt` ghép `key` (Q291): không đoán được người viết từ thứ tự nộp hay thứ
 * tự Danh sách. `salt` (ví dụ mã Phiên thi cộng mã câu) làm mỗi hàng đợi một thứ tự riêng.
 */
export function stableOrder<T>(items: readonly T[], keyOf: (item: T) => string, salt: string): T[] {
  return items
    .map((item) => ({ item, hash: stableHash(`${salt}:${keyOf(item)}`), key: keyOf(item) }))
    .sort((a, b) => a.hash - b.hash || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.item);
}

export interface SubmittedAttempt {
  attemptId: string;
  userId: string;
  attemptNo: number;
}

/**
 * Các Lượt có thể được tính vào Kết quả (Q292): `latest` chỉ Lượt cuối của mỗi người; `highest` mọi Lượt đã nộp (chưa biết Lượt
 * nào cao nhất).
 */
export function countableAttempts<T extends SubmittedAttempt>(
  attempts: readonly T[],
  attemptScoring: 'highest' | 'latest',
): T[] {
  if (attemptScoring === 'highest') return [...attempts];
  const last = new Map<string, T>();
  for (const attempt of attempts) {
    const current = last.get(attempt.userId);
    if (!current || attempt.attemptNo > current.attemptNo) last.set(attempt.userId, attempt);
  }
  return [...last.values()];
}

/**
 * Kết luận của một câu sau khi Người ra đề chấm tay hoặc sửa điểm: đủ điểm là đúng, 0 là sai, giữa là một phần; chưa có điểm là
 * chờ chấm. (Câu bỏ trống chỉ do chấm tự động đặt ra.)
 */
export function verdictOfScore(score: number | null, points: number): Verdict {
  if (score === null) return 'pending';
  if (score >= points) return 'correct';
  return score <= 0 ? 'wrong' : 'partial';
}
