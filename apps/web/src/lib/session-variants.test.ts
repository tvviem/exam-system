import { describe, expect, it } from 'vitest';
import { sessionDrawPlanOf } from './session-draw';
import {
  variantCountOf,
  variantFieldsInput,
  variantFieldsOfSession,
  variantNumbersOf,
} from './session-variants';

// V2b của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md, Q463, Q469, Q479): logic thuần của form Phiên thi.

describe('variantCountOf: ô "Số Mã đề"', () => {
  it('nhận số nguyên từ 1 đến 10', () => {
    for (const n of [1, 2, 9, 10])
      expect(variantCountOf(String(n))).toEqual({ valid: true, count: n });
    expect(variantCountOf(' 3 ')).toEqual({ valid: true, count: 3 });
  });
  it('trống, 0, 11, số lẻ, chữ: chưa hợp lệ (tạm tính 1 Mã đề)', () => {
    for (const text of ['', ' ', '0', '11', '2,5', '2.5', '-1', 'abc', '1e1']) {
      expect(variantCountOf(text), text).toEqual({ valid: false, count: 1 });
    }
  });
});

describe('variantFieldsOfSession: bản nháp từ Phiên thi đã lưu', () => {
  it('Phiên thi dùng chung: lấy số Mã đề đang có', () => {
    expect(
      variantFieldsOfSession({
        drawScope: 'shared',
        variants: [{ number: 1 }, { number: 2 }, { number: 3 }],
      }),
    ).toEqual({ drawScope: 'shared', variantCount: '3' });
  });
  it('Phiên thi mỗi người một đề, hay Phiên thi cũ chưa có trường: giữ per_candidate, số Mã đề 1', () => {
    expect(variantFieldsOfSession({ drawScope: 'per_candidate', variants: [] })).toEqual({
      drawScope: 'per_candidate',
      variantCount: '1',
    });
    expect(variantFieldsOfSession({})).toEqual({ drawScope: 'per_candidate', variantCount: '1' });
  });
});

describe('variantFieldsInput: dữ liệu gửi lên', () => {
  it('dùng chung: gửi drawScope và variantCount (số; để trống thì NaN để lược đồ báo sai)', () => {
    expect(variantFieldsInput({ drawScope: 'shared', variantCount: '3' })).toEqual({
      drawScope: 'shared',
      variantCount: 3,
    });
    expect(variantFieldsInput({ drawScope: 'shared', variantCount: '' }).variantCount).toBeNaN();
  });
  it('mỗi người một đề: chỉ gửi drawScope (không có variantCount)', () => {
    expect(variantFieldsInput({ drawScope: 'per_candidate', variantCount: '4' })).toEqual({
      drawScope: 'per_candidate',
    });
  });
});

describe('variantNumbersOf: danh sách số Mã đề để chọn', () => {
  it('lấy số thứ tự và nhãn từ Mã đề của Phiên thi', () => {
    expect(
      variantNumbersOf([
        { number: 1, label: 'Đề 1' },
        { number: 2, label: 'Đề 2' },
      ]),
    ).toEqual([
      { number: 1, label: 'Đề 1' },
      { number: 2, label: 'Đề 2' },
    ]);
    expect(variantNumbersOf(undefined)).toEqual([]);
  });
});

describe('kế hoạch rút khi dùng chung Mã đề (Q469)', () => {
  const sections = [
    { id: 'a', title: 'Phần I', defaultPercent: 40, points: [1, 1, 1, 1, 1] },
    { id: 'b', title: 'Phần II', defaultPercent: 100, points: [2, 3] },
  ];
  const uneven = [{ id: 'a', title: 'Phần I', defaultPercent: 40, points: [1, 2, 1, 1, 1] }];
  it('mỗi người một đề: Phần rút dưới 100 % mà lệch điểm bị báo (luật cũ)', () => {
    const plan = sessionDrawPlanOf(uneven, {}, 'per_candidate');
    expect(plan.problems).toEqual([{ code: 'draw_points_uneven', sectionId: 'a' }]);
    expect(plan.rows[0]?.uneven).toBe(true);
  });
  it('dùng chung: câu lệch điểm không bị báo (kiểm tổng điểm giữa các Mã đề do máy chủ làm); chỉ nêu số câu', () => {
    const plan = sessionDrawPlanOf(uneven, {}, 'shared');
    expect(plan.problems).toEqual([]);
    expect(plan.rows[0]?.uneven).toBe(false);
    expect(plan.count).toBe(2);
    expect(plan.maxPoints).toBeNull(); // điểm tối đa phụ thuộc câu được rút
  });
  it('dùng chung mà Phần cùng điểm: nêu cả điểm tối đa như trước', () => {
    expect(sessionDrawPlanOf(sections, {}, 'shared').maxPoints).toBe(7);
  });
  it('mọi Phần 0 %: vẫn báo draw_all_zero ở cả hai kiểu', () => {
    expect(sessionDrawPlanOf(sections, { a: '0', b: '0' }, 'shared').problems).toEqual([
      { code: 'draw_all_zero' },
    ]);
  });
});
