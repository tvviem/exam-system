import { describe, expect, it } from 'vitest';
import {
  appealLimitOf,
  createAppealSchema,
  extendAppealPeriodSchema,
  resolveAppealSchema,
} from './grading.js';

describe('appealLimitOf: hạn mức Phúc khảo (Q311)', () => {
  it('10 % số câu làm tròn lên, ít nhất 3', () => {
    const table: [number, number][] = [
      [0, 3],
      [1, 3],
      [5, 3],
      [10, 3],
      [30, 3],
      [31, 4], // 3,1 làm tròn lên
      [40, 4],
      [50, 5],
      [51, 6],
      [100, 10],
      [250, 25],
    ];
    for (const [items, limit] of table) expect(appealLimitOf(items), `${items} câu`).toBe(limit);
  });

  it('số câu âm không làm hỏng hạn mức', () => {
    expect(appealLimitOf(-5)).toBe(3);
  });
});

describe('createAppealSchema', () => {
  const reason = 'Tôi nghĩ đáp án B cũng đúng';

  it('Phúc khảo một câu theo số câu đã thấy', () => {
    expect(createAppealSchema.parse({ target: 'response', no: 7, reason })).toEqual({
      target: 'response',
      no: 7,
      reason,
    });
  });

  it('Phúc khảo một Mức xử lý cần id Vi phạm', () => {
    const violationId = '0198f0aa-0000-7000-8000-000000000001';
    expect(createAppealSchema.safeParse({ target: 'penalty', violationId, reason }).success).toBe(
      true,
    );
    expect(createAppealSchema.safeParse({ target: 'penalty', reason }).success).toBe(false);
  });

  it('lý do 10–1000 ký tự sau khi bỏ khoảng trắng hai đầu', () => {
    expect(
      createAppealSchema.safeParse({ target: 'response', no: 1, reason: '   ngắn   ' }).success,
    ).toBe(false);
    expect(
      createAppealSchema.safeParse({ target: 'response', no: 1, reason: 'x'.repeat(1001) }).success,
    ).toBe(false);
    expect(
      createAppealSchema.safeParse({ target: 'response', no: 1, reason: 'x'.repeat(10) }).success,
    ).toBe(true);
  });

  it('số câu phải nguyên dương; không nhận trường lạ', () => {
    expect(createAppealSchema.safeParse({ target: 'response', no: 0, reason }).success).toBe(false);
    expect(createAppealSchema.safeParse({ target: 'response', no: 1.5, reason }).success).toBe(
      false,
    );
    expect(
      createAppealSchema.safeParse({ target: 'response', no: 1, reason, itemId: 'x' }).success,
    ).toBe(false);
  });
});

describe('resolveAppealSchema', () => {
  it('câu trả lời bắt buộc kèm điểm mới (tối đa 2 chữ số thập phân)', () => {
    expect(resolveAppealSchema.safeParse({ response: 'Đã xem lại', score: 2.5 }).success).toBe(
      true,
    );
    expect(resolveAppealSchema.safeParse({ response: 'Đã xem lại', score: 2.555 }).success).toBe(
      false,
    );
    expect(resolveAppealSchema.safeParse({ response: '  ', score: 1 }).success).toBe(false);
    expect(resolveAppealSchema.safeParse({ score: 1 }).success).toBe(false);
  });

  it('hoặc Mức xử lý mới', () => {
    const parsed = resolveAppealSchema.parse({
      response: 'Giảm xuống 5 %',
      penalty: { type: 'percent', percent: 5 },
    });
    expect('penalty' in parsed).toBe(true);
    expect(
      resolveAppealSchema.safeParse({ response: 'ok', penalty: { type: 'none' } }).success,
    ).toBe(true);
  });

  it('không gửi cả điểm lẫn Mức xử lý', () => {
    expect(
      resolveAppealSchema.safeParse({ response: 'ok', score: 1, penalty: { type: 'none' } })
        .success,
    ).toBe(false);
  });
});

describe('extendAppealPeriodSchema (Q314)', () => {
  it('tổng số ngày từ 1 đến 14', () => {
    expect(extendAppealPeriodSchema.safeParse({ appealPeriodDays: 14 }).success).toBe(true);
    expect(extendAppealPeriodSchema.safeParse({ appealPeriodDays: 15 }).success).toBe(false);
    expect(extendAppealPeriodSchema.safeParse({ appealPeriodDays: 0 }).success).toBe(false);
    expect(extendAppealPeriodSchema.safeParse({ appealPeriodDays: 2.5 }).success).toBe(false);
  });
});
