import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_GRACE_SECONDS,
  deadlineOf,
  isPastGrace,
  type LayoutInput,
  layoutOf,
  responseSchemaFor,
} from './attempt.js';

const at = (iso: string) => new Date(iso);

describe('deadlineOf: hạn nộp của một Lượt (Q208, Q230)', () => {
  const base = {
    startedAt: at('2026-12-01T01:10:00Z'),
    durationMinutes: 45,
    extraMinutes: 0,
    hardClose: false,
    closesAt: at('2026-12-01T03:00:00Z'),
  };

  it('bắt đầu cộng Thời lượng', () => {
    expect(deadlineOf(base)).toEqual(at('2026-12-01T01:55:00Z'));
  });

  it('cộng cả giờ cộng sẵn của người đó', () => {
    expect(deadlineOf({ ...base, extraMinutes: 15 })).toEqual(at('2026-12-01T02:10:00Z'));
  });

  it('tắt Cắt cứng thì người bắt đầu muộn vẫn được đủ Thời lượng dù quá giờ đóng', () => {
    const late = { ...base, startedAt: at('2026-12-01T02:50:00Z') };
    expect(deadlineOf(late)).toEqual(at('2026-12-01T03:35:00Z'));
  });

  it('bật Cắt cứng thì không vượt giờ đóng', () => {
    const late = { ...base, startedAt: at('2026-12-01T02:50:00Z'), hardClose: true };
    expect(deadlineOf(late)).toEqual(at('2026-12-01T03:00:00Z'));
  });

  it('bật Cắt cứng mà hạn thường đã trước giờ đóng thì giữ hạn thường', () => {
    expect(deadlineOf({ ...base, hardClose: true })).toEqual(at('2026-12-01T01:55:00Z'));
  });

  it('ân hạn nhận Câu trả lời là 30 giây: đúng 30 giây vẫn nhận, quá một mili giây là hết', () => {
    expect(ATTEMPT_GRACE_SECONDS).toBe(30);
    const deadline = at('2026-12-01T01:55:00Z');
    expect(isPastGrace(deadline, at('2026-12-01T01:55:30.000Z'))).toBe(false);
    expect(isPastGrace(deadline, at('2026-12-01T01:55:30.001Z'))).toBe(true);
  });
});

const input = (): LayoutInput => ({
  sections: [
    {
      sectionId: 's1',
      items: [
        {
          itemId: 'i1',
          type: 'single_choice',
          optionIds: ['a', 'b', 'c', 'd'],
          shuffleOptions: true,
        },
        {
          itemId: 'i2',
          type: 'multiple_choice',
          optionIds: ['a', 'b', 'c'],
          shuffleOptions: false,
        },
        {
          itemId: 'i3',
          type: 'true_false_cluster',
          optionIds: ['s1', 's2', 's3', 's4'],
          shuffleOptions: true,
        },
        { itemId: 'i4', type: 'essay', optionIds: [], shuffleOptions: false },
        { itemId: 'i5', type: 'single_choice', optionIds: ['a', 'b'], shuffleOptions: true },
        { itemId: 'i6', type: 'single_choice', optionIds: ['a', 'b', 'c'], shuffleOptions: true },
      ],
    },
    {
      sectionId: 's2',
      items: [
        {
          itemId: 'j1',
          type: 'single_choice',
          optionIds: ['a', 'b', 'c', 'd'],
          shuffleOptions: true,
        },
        {
          itemId: 'j2',
          type: 'single_choice',
          optionIds: ['a', 'b', 'c', 'd'],
          shuffleOptions: true,
        },
        { itemId: 'j3', type: 'essay', optionIds: [], shuffleOptions: false },
      ],
    },
  ],
});
const ids = (layout: ReturnType<typeof layoutOf>, section: number) =>
  layout.sections[section]?.items.map((i) => i.itemId);

describe('layoutOf: thứ tự câu và Phương án của một Lượt (Q199, Q215)', () => {
  const off = { shuffleItems: false, shuffleOptions: false };
  const on = { shuffleItems: true, shuffleOptions: true };

  it('công tắc tắt thì giữ nguyên thứ tự và không có thứ tự Phương án', () => {
    const layout = layoutOf(42, input(), off);
    expect(ids(layout, 0)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']);
    expect(layout.sections.flatMap((s) => s.items).every((i) => i.optionOrder === undefined)).toBe(
      true,
    );
  });

  it('cùng hạt giống cho cùng bố cục, kể cả gọi lại nhiều lần', () => {
    expect(layoutOf(123456789, input(), on)).toEqual(layoutOf(123456789, input(), on));
  });

  it('khác hạt giống thì (hầu như chắc chắn) khác bố cục', () => {
    const seen = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(layoutOf(s, input(), on))));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('xáo câu trong từng Phần, không xáo Phần và không đưa câu sang Phần khác', () => {
    for (const seed of [1, 7, 99, 2 ** 40 + 3]) {
      const layout = layoutOf(seed, input(), { shuffleItems: true, shuffleOptions: false });
      expect(layout.sections.map((s) => s.sectionId)).toEqual(['s1', 's2']);
      expect([...(ids(layout, 0) ?? [])].sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']);
      expect([...(ids(layout, 1) ?? [])].sort()).toEqual(['j1', 'j2', 'j3']);
    }
  });

  it('xáo Phương án chỉ với câu chọn một/chọn nhiều có cờ shuffleOptions; thứ tự là hoán vị đủ Phương án', () => {
    const layout = layoutOf(5, input(), { shuffleItems: false, shuffleOptions: true });
    const byId = new Map(layout.sections.flatMap((s) => s.items).map((i) => [i.itemId, i]));
    expect([...(byId.get('i1')?.optionOrder ?? [])].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(byId.get('i2')?.optionOrder).toBeUndefined(); // câu tắt shuffleOptions
    expect(byId.get('i3')?.optionOrder).toBeUndefined(); // Mệnh đề không xáo (Q215)
    expect(byId.get('i4')?.optionOrder).toBeUndefined(); // tự luận
  });

  it('công tắc Phiên thi tắt thì không xáo Phương án dù câu có cờ', () => {
    const layout = layoutOf(5, input(), { shuffleItems: true, shuffleOptions: false });
    expect(layout.sections.flatMap((s) => s.items).every((i) => i.optionOrder === undefined)).toBe(
      true,
    );
  });

  it('có xáo thật: thử nhiều hạt giống thì có hạt đổi thứ tự câu và Phương án', () => {
    const orders = new Set<string>();
    const options = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const layout = layoutOf(seed, input(), on);
      orders.add((ids(layout, 0) ?? []).join(','));
      options.add(
        (layout.sections[0]?.items.find((i) => i.itemId === 'i1')?.optionOrder ?? []).join(''),
      );
    }
    expect(orders.size).toBeGreaterThan(10);
    expect(options.size).toBeGreaterThan(10);
  });
});

describe('responseSchemaFor: hình dạng Câu trả lời theo từng Loại (slice-4.md)', () => {
  const single = responseSchemaFor({
    type: 'single_choice',
    payload: { options: [{ id: 'o1' }, { id: 'o2' }] },
  });
  const multi = responseSchemaFor({
    type: 'multiple_choice',
    payload: { options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] },
  });
  const cluster = responseSchemaFor({
    type: 'true_false_cluster',
    payload: { statements: [{ id: 's1' }, { id: 's2' }] },
  });
  const essay = responseSchemaFor({ type: 'essay', payload: { maxLength: 10 } });

  it('chọn một: một optionId có thật, hoặc null (bỏ trả lời)', () => {
    expect(single.safeParse({ optionId: 'o2' }).success).toBe(true);
    expect(single.safeParse(null).success).toBe(true);
    expect(single.safeParse({ optionId: 'o9' }).success).toBe(false);
    expect(single.safeParse({ optionIds: ['o1'] }).success).toBe(false);
    expect(single.safeParse({ optionId: 'o1', thua: 1 }).success).toBe(false);
  });

  it('chọn nhiều: các optionId có thật, không trùng; rỗng là hợp lệ', () => {
    expect(multi.safeParse({ optionIds: ['o1', 'o3'] }).success).toBe(true);
    expect(multi.safeParse({ optionIds: [] }).success).toBe(true);
    expect(multi.safeParse({ optionIds: ['o1', 'o1'] }).success).toBe(false);
    expect(multi.safeParse({ optionIds: ['o4'] }).success).toBe(false);
  });

  it('chùm đúng/sai: đúng hoặc sai cho từng Mệnh đề có thật, có thể thiếu Mệnh đề', () => {
    expect(cluster.safeParse({ answers: { s1: true } }).success).toBe(true);
    expect(cluster.safeParse({ answers: { s1: true, s2: false } }).success).toBe(true);
    expect(cluster.safeParse({ answers: {} }).success).toBe(true);
    expect(cluster.safeParse({ answers: { s3: true } }).success).toBe(false);
    expect(cluster.safeParse({ answers: { s1: 'đúng' } }).success).toBe(false);
  });

  it('tự luận: chuỗi không quá maxLength ký tự', () => {
    expect(essay.safeParse({ text: 'x'.repeat(10) }).success).toBe(true);
    expect(essay.safeParse({ text: 'x'.repeat(11) }).success).toBe(false);
    expect(essay.safeParse({ text: 5 }).success).toBe(false);
  });
});
