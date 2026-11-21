import { describe, expect, it } from 'vitest';
import { overridesInputOf, parseOverride, sessionDrawPlanOf } from './session-draw';

// Rút câu ở form Phiên thi (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8): kế thừa mặc định của Bộ đề, ghi đè từng Phần.

/** Phần A: 10 câu × 1 điểm, mặc định 40 %; Phần B: 5 câu × 2 điểm, mặc định 100 %; Phần C: 3 câu điểm 1, 2, 3. */
const sections = [
  { id: 'a', title: 'Phần A', defaultPercent: 40, points: Array(10).fill(1) },
  { id: 'b', title: 'Phần B', defaultPercent: 100, points: Array(5).fill(2) },
  { id: 'c', title: null, defaultPercent: 100, points: [1, 2, 3] },
];

describe('parseOverride: chuỗi người dùng gõ thành tỷ lệ', () => {
  it('nhận dấu phẩy và dấu chấm; để trống hoặc chữ là NaN', () => {
    expect(parseOverride('40')).toBe(40);
    expect(parseOverride('12,5')).toBe(12.5);
    expect(parseOverride(' 7.25 ')).toBe(7.25);
    expect(parseOverride('')).toBeNaN();
    expect(parseOverride('abc')).toBeNaN();
  });
});

describe('sessionDrawPlanOf: kế hoạch rút câu của Phiên thi', () => {
  it('không ghi đè: dùng mặc định của Bộ đề (Phần A 40 % → 4 câu); điểm lệch ở Phần 100 % không phải vấn đề', () => {
    const plan = sessionDrawPlanOf(sections, {});
    expect(plan.rows.map((r) => [r.id, r.percent, r.count, r.total, r.changed])).toEqual([
      ['a', 40, 4, 10, false],
      ['b', 100, 5, 5, false],
      ['c', 100, 3, 3, false],
    ]);
    expect(plan).toMatchObject({ count: 12, hasOverrides: false, problems: [], maxPoints: 20 });
  });

  it('ghi đè thắng mặc định: Phần A đặt 100 % thì lấy đủ 10 câu', () => {
    const plan = sessionDrawPlanOf(sections, { a: '100' });
    expect(plan.rows[0]).toMatchObject({ percent: 100, count: 10, changed: true });
    expect(plan.hasOverrides).toBe(true);
    expect(plan.count).toBe(18);
  });

  it('ghi đè bằng đúng mặc định không tính là thay đổi', () => {
    expect(sessionDrawPlanOf(sections, { a: '40' }).rows[0]?.changed).toBe(false);
    expect(sessionDrawPlanOf(sections, { a: '40' }).hasOverrides).toBe(false);
  });

  it('ghi đè xuống tỷ lệ khác: Phần B 60 % của 5 câu rút 3 câu, tối đa tính theo điểm mỗi câu', () => {
    const plan = sessionDrawPlanOf(sections, { b: '60' });
    expect(plan.rows[1]).toMatchObject({ percent: 60, count: 3 });
    expect(plan.maxPoints).toBe(4 + 6 + 6); // 4 × 1 + 3 × 2 + đủ 3 câu của Phần C (1 + 2 + 3)
  });

  it('Phần lệch điểm bị ghi đè xuống dưới 100 %: báo đúng Phần, ẩn điểm tối đa (Q441)', () => {
    const plan = sessionDrawPlanOf(sections, { c: '50' });
    expect(plan.problems).toEqual([{ code: 'draw_points_uneven', sectionId: 'c' }]);
    expect(plan.rows[2]?.uneven).toBe(true);
    expect(plan.maxPoints).toBeNull();
    expect(plan.count).toBe(4 + 5 + 2);
  });

  it('mọi Phần hiệu lực 0 %: báo draw_all_zero (Q440)', () => {
    const plan = sessionDrawPlanOf(sections, { a: '0', b: '0', c: '0' });
    expect(plan.problems).toEqual([{ code: 'draw_all_zero' }]);
    expect(plan.count).toBe(0);
  });

  it('số đang gõ dở (để trống, ngoài 0 đến 100, quá hai chữ số lẻ) đánh dấu không hợp lệ và tạm tính như mặc định', () => {
    for (const bad of ['', '150', '33,333', '-5', 'abc']) {
      const plan = sessionDrawPlanOf(sections, { a: bad });
      expect(plan.rows[0]?.valid, bad).toBe(false);
      expect(plan.rows[0]?.percent, bad).toBe(40);
      expect(plan.valid, bad).toBe(false);
    }
    expect(sessionDrawPlanOf(sections, {}).valid).toBe(true);
  });

  it('Bộ đề một Phần, Phiên thi ghi đè 40 %: 40 câu của 100 câu', () => {
    const plan = sessionDrawPlanOf(
      [{ id: 'x', title: null, defaultPercent: 100, points: Array(100).fill(1) }],
      { x: '40' },
    );
    expect(plan).toMatchObject({ count: 40, maxPoints: 40, hasOverrides: true, problems: [] });
  });
});

describe('overridesInputOf: sectionDraws gửi lên server', () => {
  it('chỉ gồm Phần có nhập; Phần không nhập kế thừa; luôn là mảng (rỗng để xóa hết ghi đè khi sửa)', () => {
    expect(overridesInputOf({})).toEqual([]);
    expect(overridesInputOf({ a: '70', b: '12,5' })).toEqual([
      { sectionId: 'a', percent: 70 },
      { sectionId: 'b', percent: 12.5 },
    ]);
  });

  it('số đang gõ dở thành NaN để schema chung chặn trước khi gửi', () => {
    const [entry] = overridesInputOf({ a: '' });
    expect(entry?.percent).toBeNaN();
  });
});
