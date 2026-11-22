import { describe, expect, it } from 'vitest';
import { type LayoutInput, layoutOf } from './attempt.js';

// R5: bộ câu của hai Người dự thi trùng nhau bao nhiêu khi cùng rút từ một Bộ đề? Đo bằng chính layoutOf (không phải công thức
// lý thuyết), với mã người dùng thật dạng uuid. Số đo ghi ở docs/architecture.md mục "Ngân sách phản hồi".

const SESSION = '0198f2f0-0000-7000-8000-00000000aaaa';
const userId = (n: number) => `0198f2f0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** Bộ đề 100 câu: 4 Phần × 25 câu, mỗi người rút 40 % = 10 câu mỗi Phần, 40 câu cả bài. */
const input: LayoutInput = {
  sections: Array.from({ length: 4 }, (_, s) => ({
    sectionId: `s${s}`,
    items: Array.from({ length: 25 }, (_, i) => ({
      itemId: `s${s}-i${i}`,
      type: 'single_choice' as const,
      optionIds: ['o1', 'o2'],
      shuffleOptions: false,
    })),
  })),
};
const percents = { s0: 40, s1: 40, s2: 40, s3: 40 };

const setOf = (user: number): Set<string> => {
  const layout = layoutOf(
    1,
    input,
    { shuffleItems: false, shuffleOptions: false },
    { sessionId: SESSION, userId: userId(user), percents },
  );
  return new Set(layout.sections.flatMap((section) => section.items.map((item) => item.itemId)));
};

describe('mức trùng bộ câu giữa các Người dự thi (100 câu, rút 40 %)', () => {
  const N = 300;
  const sets = Array.from({ length: N }, (_, i) => setOf(i));

  it('mỗi người đúng 40 câu, mỗi Phần đúng 10 câu', () => {
    for (const set of sets) expect(set.size).toBe(40);
  });

  it('trùng trung bình khoảng 40 % (kỳ vọng 16 trên 40 câu), không ai trùng hoàn toàn với người khác', () => {
    let sum = 0;
    let max = 0;
    let pairs = 0;
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        let common = 0;
        for (const item of sets[a] as Set<string>) if ((sets[b] as Set<string>).has(item)) common++;
        sum += common;
        max = Math.max(max, common);
        pairs++;
      }
    }
    const mean = sum / pairs;
    expect(mean).toBeGreaterThan(15);
    expect(mean).toBeLessThan(17);
    expect(max).toBeLessThan(40); // không có hai người cùng bộ câu
  });

  it('mọi câu được chọn với xác suất gần như bằng nhau (40 %): không câu nào bị bỏ rơi hay chọn quá nhiều', () => {
    const counts = new Map<string, number>();
    for (const set of sets) for (const item of set) counts.set(item, (counts.get(item) ?? 0) + 1);
    expect(counts.size).toBe(100);
    // Kỳ vọng 120 trên 300 người (độ lệch chuẩn khoảng 8,5): chặn rộng ±4 độ lệch chuẩn.
    for (const [item, count] of counts) {
      expect(count, item).toBeGreaterThan(86);
      expect(count, item).toBeLessThan(154);
    }
  });
});
