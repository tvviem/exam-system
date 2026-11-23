import { describe, expect, it } from 'vitest';
import { sessionDrawPlanOf } from './session-draw';
import {
  attemptItemCount,
  canChangeVariant,
  candidateVariantLabel,
  matchesVariant,
  monitorVariantOptions,
  variantCountOf,
  variantFieldsInput,
  variantFieldsOfSession,
  variantLoadSummary,
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

describe('variantLoadSummary: số người mỗi Mã đề trong Danh sách dự thi (V3b)', () => {
  const loads = (...counts: number[]) =>
    counts.map((count, i) => ({ number: i + 1, label: `Đề ${i + 1}`, count }));
  it('chia đều (lệch tối đa 1): không cảnh báo', () => {
    expect(variantLoadSummary(loads(3, 3, 3))).toMatchObject({ total: 9, uneven: false });
    expect(variantLoadSummary(loads(3, 3, 2))).toMatchObject({ total: 8, uneven: false });
    expect(variantLoadSummary(loads(0, 0))).toMatchObject({ total: 0, uneven: false });
  });
  it('lệch hơn 1 người: cảnh báo (sau khi đổi tay)', () => {
    expect(variantLoadSummary(loads(9, 0, 0))).toMatchObject({ total: 9, uneven: true });
    expect(variantLoadSummary(loads(4, 2))).toMatchObject({ uneven: true });
  });
  it('giữ thứ tự và nhãn của từng Mã đề', () => {
    expect(variantLoadSummary(loads(2, 1)).parts).toEqual([
      { number: 1, label: 'Đề 1', count: 2 },
      { number: 2, label: 'Đề 2', count: 1 },
    ]);
  });
  it('một Mã đề hay không có Mã đề: không bao giờ cảnh báo lệch', () => {
    expect(variantLoadSummary(loads(5)).uneven).toBe(false);
    expect(variantLoadSummary([])).toEqual({ parts: [], total: 0, uneven: false });
    expect(variantLoadSummary(undefined)).toEqual({ parts: [], total: 0, uneven: false });
  });
});

describe('canChangeVariant: ô đổi Mã đề của một người', () => {
  it('người chưa có Lượt đổi được; đã có Lượt thì khóa (Mã đề đã chụp vào Lượt)', () => {
    expect(canChangeVariant({ attemptCount: 0 })).toBe(true);
    expect(canChangeVariant({ attemptCount: 1 })).toBe(false);
    expect(canChangeVariant({ attemptCount: 3 })).toBe(false);
  });
});

describe('candidateVariantLabel: Mã đề của bạn (Q471)', () => {
  it('có Mã đề thì trả nhãn; không có (một Mã đề hay mỗi người một đề, máy chủ trả null hay vắng) thì ẩn', () => {
    expect(candidateVariantLabel({ number: 2, label: 'Đề 2' })).toBe('Đề 2');
    expect(candidateVariantLabel(null)).toBeNull();
    expect(candidateVariantLabel(undefined)).toBeNull();
  });
});

describe('attemptItemCount: bài gồm N câu', () => {
  it('cộng số câu của mọi Phần', () => {
    expect(attemptItemCount([{ items: [1, 2, 3] }, { items: [] }, { items: [4, 5] }])).toBe(5);
    expect(attemptItemCount([])).toBe(0);
  });
});

describe('Theo dõi: lọc theo Mã đề (Q474)', () => {
  const people = [
    { userId: 'a', variant: { number: 2, label: 'Đề 2' } },
    { userId: 'b', variant: { number: 1, label: 'Đề 1' } },
    { userId: 'c', variant: { number: 2, label: 'Đề 2' } },
    { userId: 'd', variant: null },
  ];
  it('danh sách Mã đề để chọn: không trùng, theo số thứ tự, bỏ người không có Mã đề', () => {
    expect(monitorVariantOptions(people)).toEqual([
      { number: 1, label: 'Đề 1' },
      { number: 2, label: 'Đề 2' },
    ]);
    expect(monitorVariantOptions([{ userId: 'x', variant: null }])).toEqual([]);
  });
  it('lọc: để trống là tất cả; chọn Mã đề thì chỉ người của Mã đề đó', () => {
    expect(people.filter((p) => matchesVariant(p, '')).map((p) => p.userId)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(people.filter((p) => matchesVariant(p, '2')).map((p) => p.userId)).toEqual(['a', 'c']);
    expect(people.filter((p) => matchesVariant(p, '1')).map((p) => p.userId)).toEqual(['b']);
    expect(people.filter((p) => matchesVariant(p, '9'))).toEqual([]);
  });
});
