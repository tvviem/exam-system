import { describe, expect, it } from 'vitest';
import { type LayoutInput, layoutOf } from './attempt.js';
import {
  assignBalanced,
  drawVariantItems,
  itemIdsBySectionOf,
  layoutInputForVariant,
  leastLoadedVariant,
  variantSeedOf,
} from './variant.js';

// Mã đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.3): hàm thuần, V1.

const items = (section: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${section}-i${String(i).padStart(2, '0')}`);
const sections = [
  { sectionId: 's0', itemIds: items('s0', 25) },
  { sectionId: 's1', itemIds: items('s1', 10) },
];

describe('variantSeedOf: hạt giống rút của một Phần trong một Mã đề', () => {
  it('cố định theo (hạt giống rút, Phần); khác Phần hay khác hạt giống thì khác', () => {
    expect(variantSeedOf(7, 's0')).toBe(variantSeedOf(7, 's0'));
    expect(variantSeedOf(7, 's0')).not.toBe(variantSeedOf(7, 's1'));
    expect(variantSeedOf(7, 's0')).not.toBe(variantSeedOf(8, 's0'));
  });
  it('là số nguyên dưới 2^48 (khớp hạt giống 48 bit)', () => {
    for (const seed of [0, 1, 2 ** 40, 2 ** 48 - 1]) {
      const value = variantSeedOf(seed, 'sec');
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 48).toBe(true);
    }
  });
});

describe('drawVariantItems: bộ câu của một Mã đề', () => {
  it('mỗi Phần đúng số câu theo tỷ lệ (làm tròn nửa lên, tối thiểu 1), giữ thứ tự gốc, không trùng', () => {
    const drawn = drawVariantItems(sections, { s0: 40, s1: 100 }, 12345);
    expect(drawn.s0).toHaveLength(10); // 40 % của 25
    expect(drawn.s1).toEqual(sections[1]?.itemIds); // 100 %: đủ, đúng thứ tự gốc
    expect(new Set(drawn.s0).size).toBe(10);
    expect(drawn.s0).toEqual([...(drawn.s0 as string[])].sort()); // giữ thứ tự gốc (id đặt theo thứ tự)
    for (const id of drawn.s0 as string[]) expect(sections[0]?.itemIds).toContain(id);
  });

  it('cùng hạt giống thì cùng bộ câu; khác hạt giống thì (hầu như chắc chắn) khác', () => {
    const a = drawVariantItems(sections, { s0: 40 }, 1);
    expect(drawVariantItems(sections, { s0: 40 }, 1)).toEqual(a);
    expect(drawVariantItems(sections, { s0: 40 }, 2).s0).not.toEqual(a.s0);
  });

  it('tăng tỷ lệ với cùng hạt giống chỉ THÊM câu, không đổi các câu đã có', () => {
    for (const seed of [1, 99, 2 ** 40 + 5]) {
      let previous = new Set<string>();
      for (const percent of [4, 20, 40, 41, 60, 80, 100]) {
        const now = new Set(drawVariantItems(sections, { s0: percent }, seed).s0);
        for (const id of previous) expect(now.has(id), `${seed}/${percent}/${id}`).toBe(true);
        previous = now;
      }
    }
  });

  it('Phần 0 % không lấy câu nào; Phần không có tỷ lệ lấy đủ', () => {
    const drawn = drawVariantItems(sections, { s0: 0 }, 3);
    expect(drawn.s0).toEqual([]);
    expect(drawn.s1).toEqual(sections[1]?.itemIds); // không nêu tỷ lệ: 100 %
  });

  it('mỗi câu được chọn với xác suất như nhau (kiểm trên nhiều hạt giống)', () => {
    const hits = new Map<string, number>();
    const N = 4000;
    for (let seed = 0; seed < N; seed++) {
      for (const id of drawVariantItems(sections, { s0: 40 }, seed).s0 as string[]) {
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
    }
    // Mỗi câu kỳ vọng N × 10/25 = 1600 lần; dung sai rộng (5 độ lệch chuẩn ≈ 5 × 31).
    for (const id of sections[0]?.itemIds ?? []) {
      expect(Math.abs((hits.get(id) ?? 0) - 1600), id).toBeLessThan(160);
    }
  });
});

describe('assignBalanced: chia người vào Mã đề', () => {
  const users = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`);
  const rng = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  };
  const counts = (map: Map<string, number>, k: number) =>
    Array.from({ length: k }, (_, v) => [...map.values()].filter((x) => x === v).length);

  it('mọi người đều có Mã đề; số người các Mã đề lệch nhau không quá 1', () => {
    for (const [n, k] of [
      [90, 3],
      [31, 4],
      [7, 10],
      [1, 1],
      [0, 5],
      [100, 10],
    ] as const) {
      const map = assignBalanced(users(n), k, rng(n * 31 + k));
      expect(map.size).toBe(n);
      const c = counts(map, k);
      expect(Math.max(...c) - Math.min(...c), `${n}/${k}`).toBeLessThanOrEqual(1);
      for (const v of map.values()) expect(v >= 0 && v < k).toBe(true);
    }
  });

  it('có yếu tố ngẫu nhiên: hai hạt giống cho cách chia khác nhau (không chia theo thứ tự danh sách)', () => {
    const a = assignBalanced(users(30), 3, rng(1));
    const b = assignBalanced(users(30), 3, rng(2));
    expect([...a]).not.toEqual([...b]);
  });
});

describe('leastLoadedVariant: Mã đề ít người nhất cho người vào sau', () => {
  it('chọn Mã đề có ít người nhất', () => {
    expect(leastLoadedVariant([5, 3, 4])).toBe(1);
  });
  it('hòa thì lấy số nhỏ hơn', () => {
    expect(leastLoadedVariant([2, 2, 3])).toBe(0);
    expect(leastLoadedVariant([4, 1, 1])).toBe(1);
  });
  it('một Mã đề, hoặc chưa ai: Mã đề đầu', () => {
    expect(leastLoadedVariant([9])).toBe(0);
    expect(leastLoadedVariant([0, 0, 0])).toBe(0);
  });
});

describe('layoutInputForVariant + layoutOf: Lượt dùng đúng bộ câu của Mã đề (điểm kiểm thử 2)', () => {
  const input: LayoutInput = {
    sections: sections.map((s) => ({
      sectionId: s.sectionId,
      items: s.itemIds.map((itemId) => ({
        itemId,
        type: 'single_choice' as const,
        optionIds: ['o1', 'o2', 'o3'],
        shuffleOptions: true,
      })),
    })),
  };
  const flags = { shuffleItems: true, shuffleOptions: true };
  const picked = drawVariantItems(sections, { s0: 40, s1: 50 }, 77);

  it('chỉ giữ các câu của Mã đề, theo thứ tự gốc của Bộ đề', () => {
    const filtered = layoutInputForVariant(input, picked);
    expect(filtered.sections.map((s) => s.items.map((i) => i.itemId))).toEqual([
      picked.s0,
      picked.s1,
    ]);
  });

  it('Phần không nêu trong Mã đề thì rỗng (không lấy câu nào)', () => {
    const filtered = layoutInputForVariant(input, { s1: picked.s1 as string[] });
    expect(filtered.sections[0]?.items).toEqual([]);
    expect(filtered.sections[1]?.items.length).toBe(picked.s1?.length);
  });

  it('bố cục Lượt trên tập câu của Mã đề: đủ câu của Mã đề, xáo theo hạt giống Lượt, không rút thêm', () => {
    const filtered = layoutInputForVariant(input, picked);
    const layout = layoutOf(555, filtered, flags);
    expect(layout.sections.map((s) => s.items.length)).toEqual([10, 5]);
    expect(new Set(layout.sections[0]?.items.map((i) => i.itemId))).toEqual(new Set(picked.s0));
    // Hai Lượt khác hạt giống: cùng tập câu, (hầu như chắc chắn) khác thứ tự.
    const other = layoutOf(556, filtered, flags);
    expect(new Set(other.sections[0]?.items.map((i) => i.itemId))).toEqual(new Set(picked.s0));
    expect(other.sections[0]?.items.map((i) => i.itemId)).not.toEqual(
      layout.sections[0]?.items.map((i) => i.itemId),
    );
  });

  it('Mã đề lấy đủ mọi câu thì bố cục y hệt Bộ đề không rút (Phiên thi dùng nguyên Bộ đề)', () => {
    const all = drawVariantItems(sections, {}, 1);
    const full = layoutOf(9, layoutInputForVariant(input, all), flags);
    expect(full).toEqual(layoutOf(9, input, flags));
  });
});

describe('itemIdsBySectionOf: gom mã câu của Mã đề theo Phần', () => {
  it('đưa mã câu phẳng về từng Phần, giữ thứ tự gốc', () => {
    const input: LayoutInput = {
      sections: sections.map((s) => ({
        sectionId: s.sectionId,
        items: s.itemIds.map((itemId) => ({
          itemId,
          type: 'single_choice' as const,
          optionIds: ['o1', 'o2'],
          shuffleOptions: false,
        })),
      })),
    };
    const drawn = drawVariantItems(sections, { s0: 40, s1: 50 }, 5);
    const flat = new Set(Object.values(drawn).flat());
    expect(itemIdsBySectionOf(input, flat)).toEqual(drawn);
    expect(itemIdsBySectionOf(input, new Set())).toEqual({ s0: [], s1: [] });
  });
});
