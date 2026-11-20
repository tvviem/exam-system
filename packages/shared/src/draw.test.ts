import { describe, expect, it } from 'vitest';
import { type LayoutInput, layoutOf } from './attempt.js';
import { drawCountOf, drawSeedOf } from './draw.js';

// Rút câu theo Phần (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.3): số câu rút của một Phần theo Tỷ lệ rút.
describe('drawCountOf: số câu rút của một Phần', () => {
  it.each([
    // (tỷ lệ %, số câu của Phần) -> số câu rút
    [100, 40, 40], // lấy đủ: đúng cách vận hành hiện tại (Phiên thi không rút)
    [40, 100, 40], // ví dụ của chủ dự án: 40 % của 100 câu
    [40, 33, 13], // 13,2 làm tròn xuống
    [10, 25, 3], // 2,5 làm tròn nửa lên
    [50, 5, 3], // 2,5 làm tròn nửa lên
    [12.5, 4, 1], // 0,5 làm tròn nửa lên
    [62.5, 8, 5], // 5 đúng
    [45, 10, 5], // 4,5 làm tròn nửa lên
    [40.5, 10, 4], // 4,05
    [28.15, 20, 6], // 5,63 (tỷ lệ có hai chữ số lẻ như cột numeric(5,2))
  ])('%d %% của %d câu rút %d câu', (percent, total, expected) => {
    expect(drawCountOf(percent, total)).toBe(expected);
  });

  it('tỷ lệ lớn hơn 0 thì rút ít nhất 1 câu dù làm tròn ra 0', () => {
    expect(drawCountOf(1, 10)).toBe(1); // 0,1
    expect(drawCountOf(0.01, 3)).toBe(1);
    expect(drawCountOf(4, 10)).toBe(1); // 0,4
  });

  it('tỷ lệ 0 thì không rút câu nào; Phần không có câu thì rút 0', () => {
    expect(drawCountOf(0, 10)).toBe(0);
    expect(drawCountOf(50, 0)).toBe(0);
    expect(drawCountOf(0, 0)).toBe(0);
  });

  it('không bao giờ vượt số câu của Phần, kể cả tỷ lệ quá 100 hoặc làm tròn lên', () => {
    expect(drawCountOf(100, 10)).toBe(10);
    expect(drawCountOf(99.99, 10)).toBe(10);
    expect(drawCountOf(150, 10)).toBe(10);
  });

  it('mọi tỷ lệ nguyên từ 0 đến 100 và mọi cỡ Phần đến 60 cho kết quả trong khoảng hợp lệ và không giảm khi tỷ lệ tăng', () => {
    for (let total = 0; total <= 60; total++) {
      let previous = 0;
      for (let percent = 0; percent <= 100; percent++) {
        const count = drawCountOf(percent, total);
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(total);
        expect(count).toBeGreaterThanOrEqual(previous);
        previous = count;
      }
      expect(drawCountOf(100, total)).toBe(total);
    }
  });
});

describe('drawSeedOf: hạt giống rút của một người trong một Phần (Q389 a)', () => {
  it('phân tán đều trên 16 ô theo bit cao và bit thấp, kể cả với mã người dự thi liên tiếp (mỗi ô khoảng 1/16)', () => {
    const seeds = Array.from({ length: 16_000 }, (_, i) =>
      drawSeedOf('0197a6f0-0000-7000-8000-000000000001', `${1000 + i}`, 'P'),
    );
    for (const bucketOf of [
      (seed: number) => Math.floor(seed / 2 ** 44), // 4 bit cao của 48 bit
      (seed: number) => seed % 16, // 4 bit thấp
    ]) {
      const counts = new Array<number>(16).fill(0);
      for (const seed of seeds) counts[bucketOf(seed)] = (counts[bucketOf(seed)] ?? 0) + 1;
      for (const count of counts) {
        expect(count).toBeGreaterThan(850); // kỳ vọng 1000, độ lệch chuẩn khoảng 31
        expect(count).toBeLessThan(1150);
      }
    }
  });

  const S = '0197a6f0-0000-7000-8000-000000000001';
  const U = '0197a6f0-0000-7000-8000-0000000000aa';
  const P = '0197a6f0-0000-7000-8000-0000000000b1';

  it('xác định: cùng ba mã cho cùng hạt giống, gọi lại bao nhiêu lần cũng vậy', () => {
    expect(drawSeedOf(S, U, P)).toBe(drawSeedOf(S, U, P));
  });

  it('phụ thuộc cả mã Phiên thi, mã người dự thi và mã Phần', () => {
    const base = drawSeedOf(S, U, P);
    expect(drawSeedOf(`${S}x`, U, P)).not.toBe(base);
    expect(drawSeedOf(S, `${U}x`, P)).not.toBe(base);
    expect(drawSeedOf(S, U, `${P}x`)).not.toBe(base);
  });

  it('ranh giới giữa các mã được tính: nối khác chỗ thì khác hạt giống', () => {
    expect(drawSeedOf('ab', 'c', 'd')).not.toBe(drawSeedOf('a', 'bc', 'd'));
    expect(drawSeedOf('a', 'bc', 'd')).not.toBe(drawSeedOf('a', 'b', 'cd'));
    expect(drawSeedOf('ab', 'c', 'd')).not.toBe(drawSeedOf('abc', '', 'd'));
  });

  it('số nguyên không âm dưới 2^48 (khớp hạt giống 48 bit của Lượt), kể cả chữ Việt có dấu', () => {
    for (const [sessionId, userId, sectionId] of [
      [S, U, P],
      ['', '', ''],
      ['Phiên thi', 'Nguyễn Văn Ạ', 'Phần Đặc biệt ế'],
    ] as const) {
      const seed = drawSeedOf(sessionId, userId, sectionId);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 48);
    }
  });

  it('phân tán: 20 000 người của một Phiên thi cho 20 000 hạt giống khác nhau, trải đều trên nửa trên và nửa dưới', () => {
    const seeds = Array.from({ length: 20_000 }, (_, i) => drawSeedOf(S, `user-${i}`, P));
    expect(new Set(seeds).size).toBe(seeds.length);
    const high = seeds.filter((seed) => seed >= 2 ** 47).length;
    expect(high).toBeGreaterThan(9_500);
    expect(high).toBeLessThan(10_500);
  });
});

// ---------------- layoutOf có rút ----------------

const choice = (
  itemId: string,
  type: LayoutInput['sections'][number]['items'][number]['type'] = 'single_choice',
) => ({
  itemId,
  type,
  optionIds: ['a', 'b', 'c', 'd'],
  shuffleOptions: true,
});
const items = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => choice(`${prefix}${i + 1}`));

/** Bộ đề lớn như ví dụ của chủ dự án: Phần I 100 câu, Phần II 20 câu. */
const bigInput = (): LayoutInput => ({
  sections: [
    { sectionId: 'A', items: items('a', 100) },
    { sectionId: 'B', items: items('b', 20) },
  ],
});
const SESSION = '0197a6f0-0000-7000-8000-000000000001';
const draw = (userId: string, percents: Record<string, number>) => ({
  sessionId: SESSION,
  userId,
  percents,
});
const OFF = { shuffleItems: false, shuffleOptions: false };
const ON = { shuffleItems: true, shuffleOptions: true };
const idsOf = (layout: ReturnType<typeof layoutOf>, sectionId: string) =>
  layout.sections
    .find((section) => section.sectionId === sectionId)
    ?.items.map((item) => item.itemId) ?? [];

describe('layoutOf không rút: y hệt cách vận hành hiện tại (Phiên thi cũ không đổi)', () => {
  // Bố cục chụp từ hàm TRƯỚC khi thêm tính năng rút (hạt giống 42 và 987654321): nếu tính năng mới làm lệch, bài này đỏ.
  const small = (): LayoutInput => ({
    sections: [
      {
        sectionId: 's1',
        items: ['i1', 'i2', 'i3', 'i4', 'i5'].map((id, k) => ({
          itemId: id,
          type: k === 3 ? ('true_false_cluster' as const) : ('single_choice' as const),
          optionIds: ['a', 'b', 'c'],
          shuffleOptions: true,
        })),
      },
      {
        sectionId: 's2',
        items: ['j1', 'j2', 'j3'].map((id) => ({
          itemId: id,
          type: 'multiple_choice' as const,
          optionIds: ['a', 'b', 'c', 'd'],
          shuffleOptions: true,
        })),
      },
    ],
  });
  const goldenA = {
    sections: [
      {
        sectionId: 's1',
        items: [
          { itemId: 'i1', optionOrder: ['c', 'b', 'a'] },
          { itemId: 'i5', optionOrder: ['c', 'b', 'a'] },
          { itemId: 'i3', optionOrder: ['b', 'a', 'c'] },
          { itemId: 'i2', optionOrder: ['c', 'b', 'a'] },
          { itemId: 'i4' },
        ],
      },
      {
        sectionId: 's2',
        items: [
          { itemId: 'j2', optionOrder: ['d', 'c', 'b', 'a'] },
          { itemId: 'j1', optionOrder: ['b', 'd', 'a', 'c'] },
          { itemId: 'j3', optionOrder: ['c', 'b', 'a', 'd'] },
        ],
      },
    ],
  };
  const goldenB = {
    sections: [
      {
        sectionId: 's1',
        items: [
          { itemId: 'i3' },
          { itemId: 'i2' },
          { itemId: 'i4' },
          { itemId: 'i1' },
          { itemId: 'i5' },
        ],
      },
      { sectionId: 's2', items: [{ itemId: 'j3' }, { itemId: 'j1' }, { itemId: 'j2' }] },
    ],
  };

  it('không có `draw`: đúng bố cục chụp trước khi có tính năng rút', () => {
    expect(layoutOf(42, small(), ON)).toEqual(goldenA);
    expect(layoutOf(987654321, small(), { shuffleItems: true, shuffleOptions: false })).toEqual(
      goldenB,
    );
  });

  it('Tỷ lệ rút 100 % (hoặc Phần không có trong danh sách tỷ lệ): vẫn đúng bố cục cũ, như dùng toàn bộ Bộ đề', () => {
    const everyone = draw('nguoi-bat-ky', { s1: 100, s2: 100 });
    expect(layoutOf(42, small(), ON, everyone)).toEqual(goldenA);
    expect(
      layoutOf(987654321, small(), { shuffleItems: true, shuffleOptions: false }, everyone),
    ).toEqual(goldenB);
    expect(layoutOf(42, small(), ON, draw('nguoi-bat-ky', {}))).toEqual(goldenA);
  });

  it('Bộ đề 40 câu lấy đúng 100 %: đủ 40 câu, mọi hạt giống và công tắc cho đúng bố cục như không rút', () => {
    const forty: LayoutInput = { sections: [{ sectionId: 'A', items: items('q', 40) }] };
    for (let seed = 1; seed <= 25; seed++) {
      for (const flags of [OFF, ON, { shuffleItems: true, shuffleOptions: false }]) {
        expect(layoutOf(seed, forty, flags, draw(`u${seed}`, { A: 100 }))).toEqual(
          layoutOf(seed, forty, flags),
        );
      }
    }
  });
});

describe('layoutOf có rút: bộ câu cố định cho từng người theo Tỷ lệ rút của từng Phần', () => {
  it('mỗi Phần ra đúng drawCountOf câu: 100 câu lấy 40 %, 20 câu lấy 50 %; Phần không nêu tỷ lệ lấy đủ', () => {
    const layout = layoutOf(7, bigInput(), OFF, draw('an', { A: 40, B: 50 }));
    expect(idsOf(layout, 'A')).toHaveLength(40);
    expect(idsOf(layout, 'B')).toHaveLength(10);
    expect(idsOf(layoutOf(7, bigInput(), OFF, draw('an', { A: 40 })), 'B')).toHaveLength(20);
  });

  it('câu rút thuộc đúng Phần của nó, không lặp, và thứ tự các Phần giữ nguyên', () => {
    for (const user of ['an', 'binh', 'chi']) {
      const layout = layoutOf(3, bigInput(), ON, draw(user, { A: 40, B: 30 }));
      expect(layout.sections.map((section) => section.sectionId)).toEqual(['A', 'B']);
      for (const [sectionId, prefix] of [
        ['A', 'a'],
        ['B', 'b'],
      ] as const) {
        const ids = idsOf(layout, sectionId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => id.startsWith(prefix))).toBe(true);
      }
    }
  });

  it('cùng người, cùng Phiên thi: cùng tập câu ở mọi Lượt dù `seed` của Lượt khác nhau (Q389 a); thứ tự xáo thì theo Lượt', () => {
    const percents = { A: 40, B: 50 };
    const set = (seed: number) =>
      [...idsOf(layoutOf(seed, bigInput(), ON, draw('an', percents)), 'A')].sort();
    const first = set(1);
    for (const seed of [2, 99, 123456789, 2 ** 40 + 5]) expect(set(seed)).toEqual(first);
    const order = (seed: number) =>
      idsOf(layoutOf(seed, bigInput(), ON, draw('an', percents)), 'A').join(',');
    expect(new Set([1, 2, 3, 4, 5].map(order)).size).toBeGreaterThan(1);
  });

  it('người khác nhau nhận bộ câu khác nhau (60 người, ít nhất 55 bộ khác nhau)', () => {
    const sets = new Set(
      Array.from({ length: 60 }, (_, i) =>
        [...idsOf(layoutOf(1, bigInput(), OFF, draw(`nguoi-${i}`, { A: 40 })), 'A')]
          .sort()
          .join(','),
      ),
    );
    expect(sets.size).toBeGreaterThanOrEqual(55);
  });

  it('bật hay tắt xáo câu và Phương án không làm đổi tập câu được rút', () => {
    const set = (flags: typeof ON) =>
      [...idsOf(layoutOf(11, bigInput(), flags, draw('an', { A: 40, B: 50 })), 'A')].sort();
    const base = set(OFF);
    expect(set(ON)).toEqual(base);
    expect(set({ shuffleItems: true, shuffleOptions: false })).toEqual(base);
    expect(set({ shuffleItems: false, shuffleOptions: true })).toEqual(base);
  });

  it('tắt xáo câu: câu rút giữ đúng thứ tự gốc trong Phần (Q437)', () => {
    const ids = idsOf(layoutOf(5, bigInput(), OFF, draw('an', { A: 40 })), 'A');
    const position = (id: string) => Number(id.slice(1));
    expect(ids.map(position)).toEqual([...ids.map(position)].sort((x, y) => x - y));
  });

  it('thứ tự Phương án chỉ có ở câu được rút (câu không rút không để lại dấu vết trong bố cục)', () => {
    const layout = layoutOf(5, bigInput(), ON, draw('an', { A: 40 }));
    const entries = layout.sections.flatMap((section) => section.items);
    expect(entries.length).toBe(40 + 20);
    expect(
      entries.every((entry) => [...(entry.optionOrder ?? [])].sort().join('') === 'abcd'),
    ).toBe(true);
  });

  it('Tỷ lệ 0 %: Phần vẫn có mặt nhưng không có câu nào (Q436)', () => {
    const layout = layoutOf(5, bigInput(), ON, draw('an', { A: 0, B: 100 }));
    expect(layout.sections.map((section) => [section.sectionId, section.items.length])).toEqual([
      ['A', 0],
      ['B', 20],
    ]);
  });

  it('tỷ lệ nhỏ vẫn rút ít nhất 1 câu', () => {
    expect(idsOf(layoutOf(5, bigInput(), OFF, draw('an', { A: 0.5 })), 'A')).toHaveLength(1);
  });
});

describe('layoutOf có rút: rút đều, mỗi câu của Phần có cùng xác suất (thống kê, hạt giống cố định)', () => {
  const USERS = 4_000;
  const ten: LayoutInput = { sections: [{ sectionId: 'A', items: items('q', 10) }] };
  const picks = Array.from({ length: USERS }, (_, i) =>
    idsOf(layoutOf(1, ten, OFF, draw(`nguoi-${i}`, { A: 40 })), 'A'),
  );

  it('mỗi câu trong 10 câu được rút với tần suất khoảng 4/10', () => {
    for (let n = 1; n <= 10; n++) {
      const frequency = picks.filter((ids) => ids.includes(`q${n}`)).length / USERS;
      expect(frequency, `câu q${n}`).toBeGreaterThan(0.36);
      expect(frequency, `câu q${n}`).toBeLessThan(0.44);
    }
  });

  it('mỗi cặp câu cùng được rút với tần suất khoảng (4·3)/(10·9) = 0,133 (không có thiên lệch theo vị trí)', () => {
    for (const [x, y] of [
      ['q1', 'q2'],
      ['q1', 'q10'],
      ['q5', 'q6'],
      ['q3', 'q9'],
    ]) {
      const frequency =
        picks.filter((ids) => ids.includes(x as string) && ids.includes(y as string)).length /
        USERS;
      expect(frequency, `${x},${y}`).toBeGreaterThan(0.1);
      expect(frequency, `${x},${y}`).toBeLessThan(0.17);
    }
  });
});
