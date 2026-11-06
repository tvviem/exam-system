import { describe, expect, it } from 'vitest';
import { type AttemptScore, resultOf } from './result.js';

const a = (attemptNo: number, rawScore: number, maxScore = 10): AttemptScore => ({
  attemptId: `a${attemptNo}`,
  attemptNo,
  rawScore,
  maxScore,
});

describe('resultOf: chọn Lượt được tính', () => {
  it('không có Lượt nào thì null', () => {
    expect(resultOf({ attempts: [], attemptScoring: 'highest', penalties: [] })).toBeNull();
  });

  it('highest lấy điểm cao nhất, bằng nhau thì Lượt đầu', () => {
    const r = resultOf({
      attempts: [a(1, 6), a(2, 8), a(3, 8)],
      attemptScoring: 'highest',
      penalties: [],
    });
    expect(r?.countedAttemptId).toBe('a2');
    expect(r?.rawScore).toBe(8);
  });

  it('latest lấy Lượt cuối dù điểm thấp hơn', () => {
    const r = resultOf({ attempts: [a(2, 5), a(1, 9)], attemptScoring: 'latest', penalties: [] });
    expect(r?.countedAttemptId).toBe('a2');
    expect(r?.rawScore).toBe(5);
  });
});

describe('resultOf: Mức xử lý và quy đổi', () => {
  it('trừ 10 % rồi 20 % cộng dồn 30 %: 8,0 còn 5,6 (ví dụ Q294)', () => {
    const r = resultOf({
      attempts: [a(1, 8)],
      attemptScoring: 'highest',
      penalties: [
        { type: 'percent', percent: 10 },
        { type: 'percent', percent: 20 },
        { type: 'none' },
      ],
    });
    expect(r).toMatchObject({
      penaltyPercent: 30,
      finalScore: 5.6,
      scaledScore: 5.6,
      voided: false,
    });
  });

  it('cộng dồn tối đa 100 %', () => {
    const r = resultOf({
      attempts: [a(1, 8)],
      attemptScoring: 'highest',
      penalties: [
        { type: 'percent', percent: 70 },
        { type: 'percent', percent: 60 },
      ],
    });
    expect(r).toMatchObject({ penaltyPercent: 100, finalScore: 0, scaledScore: 0 });
  });

  it('Hủy kết quả cho 0 và ghi voided, bất kể trừ phần trăm', () => {
    const r = resultOf({
      attempts: [a(1, 9)],
      attemptScoring: 'highest',
      penalties: [{ type: 'percent', percent: 10 }, { type: 'void' }],
    });
    expect(r).toMatchObject({ voided: true, finalScore: 0, scaledScore: 0 });
  });

  it('Điểm quy đổi làm tròn đến 0,1, từ 5 trở lên làm tròn lên (Q287)', () => {
    const scaled = (raw: number, max: number) =>
      resultOf({ attempts: [a(1, raw, max)], attemptScoring: 'highest', penalties: [] })
        ?.scaledScore;
    expect(scaled(6.45, 10)).toBe(6.5);
    expect(scaled(6.44, 10)).toBe(6.4);
    expect(scaled(37, 50)).toBe(7.4);
    expect(scaled(33, 40)).toBe(8.3);
    expect(scaled(10, 10)).toBe(10);
  });

  it('Bộ đề tổng khác 10 được quy về thang 10', () => {
    const r = resultOf({ attempts: [a(1, 37.5, 50)], attemptScoring: 'highest', penalties: [] });
    expect(r?.scaledScore).toBe(7.5);
  });

  it('phần trăm lẻ (12,5 %) được tính chính xác', () => {
    const r = resultOf({
      attempts: [a(1, 8)],
      attemptScoring: 'highest',
      penalties: [{ type: 'percent', percent: 12.5 }],
    });
    expect(r?.finalScore).toBe(7);
  });

  it('tổng điểm 0 không chia cho 0', () => {
    expect(
      resultOf({ attempts: [a(1, 0, 0)], attemptScoring: 'highest', penalties: [] })?.scaledScore,
    ).toBe(0);
  });
});
