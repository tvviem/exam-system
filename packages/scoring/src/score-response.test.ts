import { describe, expect, it } from 'vitest';
import { type ScoringItem, scoreResponse } from './score-response.js';

const options = ['o1', 'o2', 'o3', 'o4'].map((id) => ({ id }));
const single: ScoringItem = {
  type: 'single_choice',
  points: 0.25,
  payload: { options, key: ['o2'] },
};
const multi = (rule: 'proportional' | 'all_or_nothing', points = 2): ScoringItem => ({
  type: 'multiple_choice',
  points,
  payload: { options, key: ['o1', 'o2', 'o3'], scoringRule: rule },
});
const statements = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, key: i % 2 === 0 }));
const cluster = (rule: string, ladder?: number[], points = 1): ScoringItem => ({
  type: 'true_false_cluster',
  points,
  payload: { statements, scoringRule: rule, ...(ladder ? { ladder } : {}) },
});
// Đáp án đúng của chùm: a đúng, b sai, c đúng, d sai.
const answers = (a: Record<string, boolean>) => ({ answers: a });
const essay: ScoringItem = { type: 'essay', points: 5, payload: { maxLength: 1000 } };

describe('câu chọn một', () => {
  it('đúng thì đủ điểm, sai thì 0, bỏ trống thì 0 và là blank', () => {
    expect(scoreResponse(single, { optionId: 'o2' })).toEqual({ score: 0.25, verdict: 'correct' });
    expect(scoreResponse(single, { optionId: 'o1' })).toEqual({ score: 0, verdict: 'wrong' });
    expect(scoreResponse(single, null)).toEqual({ score: 0, verdict: 'blank' });
    expect(scoreResponse(single, undefined)).toEqual({ score: 0, verdict: 'blank' });
  });
});

describe('câu chọn nhiều', () => {
  it('tỷ lệ: đúng 2/3 được 1,33; chọn đủ 3 đúng được đủ điểm', () => {
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'o2'] })).toEqual({
      score: 1.33,
      verdict: 'partial',
    });
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'o2', 'o3'] })).toEqual({
      score: 2,
      verdict: 'correct',
    });
  });

  it('tỷ lệ: chọn thừa một Phương án sai trừ đi một đáp án đúng (2 đúng + 1 sai → 0,67)', () => {
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'o2', 'o4'] })).toEqual({
      score: 0.67,
      verdict: 'partial',
    });
  });

  it('tỷ lệ: chọn thừa nhiều không xuống dưới 0', () => {
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'o4'] })).toEqual({
      score: 0,
      verdict: 'wrong',
    });
    expect(scoreResponse(multi('proportional'), { optionIds: ['o4'] })).toEqual({
      score: 0,
      verdict: 'wrong',
    });
  });

  it('đúng hết: chỉ khớp hoàn toàn mới có điểm', () => {
    expect(scoreResponse(multi('all_or_nothing'), { optionIds: ['o3', 'o1', 'o2'] }).score).toBe(2);
    expect(scoreResponse(multi('all_or_nothing'), { optionIds: ['o1', 'o2'] }).score).toBe(0);
    expect(
      scoreResponse(multi('all_or_nothing'), { optionIds: ['o1', 'o2', 'o3', 'o4'] }).score,
    ).toBe(0);
  });

  it('không chọn gì là blank', () => {
    expect(scoreResponse(multi('proportional'), { optionIds: [] })).toEqual({
      score: 0,
      verdict: 'blank',
    });
  });
});

describe('chùm đúng/sai', () => {
  const allRight = answers({ a: true, b: false, c: true, d: false });

  it('tỷ lệ: đúng 3/4 Mệnh đề được 0,75; đúng cả bốn đủ điểm', () => {
    expect(scoreResponse(cluster('proportional'), allRight)).toEqual({
      score: 1,
      verdict: 'correct',
    });
    expect(
      scoreResponse(cluster('proportional'), answers({ a: true, b: false, c: true, d: true })),
    ).toEqual({ score: 0.75, verdict: 'partial' });
  });

  it('Mệnh đề để trống tính là không đúng', () => {
    expect(scoreResponse(cluster('proportional'), answers({ a: true, b: false }))).toEqual({
      score: 0.5,
      verdict: 'partial',
    });
  });

  it('đúng hết: một Mệnh đề sai là 0', () => {
    expect(scoreResponse(cluster('all_or_nothing'), allRight).score).toBe(1);
    expect(
      scoreResponse(cluster('all_or_nothing'), answers({ a: true, b: false, c: true, d: true }))
        .score,
    ).toBe(0);
  });

  it('bậc thang [0, 0,1, 0,25, 0,5, 1]: đúng 0..4 Mệnh đề', () => {
    const ladder = [0, 0.1, 0.25, 0.5, 1];
    const item = cluster('ladder', ladder, 2);
    const score = (a: Record<string, boolean>) => scoreResponse(item, answers(a)).score;
    expect(score({ a: false, b: true, c: false, d: true })).toBe(0);
    expect(score({ a: true, b: true, c: false, d: true })).toBe(0.2);
    expect(score({ a: true, b: false, c: false, d: true })).toBe(0.5);
    expect(score({ a: true, b: false, c: true, d: true })).toBe(1);
    expect(score({ a: true, b: false, c: true, d: false })).toBe(2);
  });

  it('bậc thang: bỏ trống hai Mệnh đề thì tính 2 đúng (0,25)', () => {
    expect(
      scoreResponse(cluster('ladder', [0, 0.1, 0.25, 0.5, 1]), answers({ a: true, b: false }))
        .score,
    ).toBe(0.25);
  });
});

describe('câu tự luận', () => {
  it('có chữ thì chờ chấm tay (score null)', () => {
    expect(scoreResponse(essay, { text: 'Giới hạn là…' })).toEqual({
      score: null,
      verdict: 'pending',
    });
  });

  it('trống hoặc chỉ khoảng trắng tự được 0 điểm', () => {
    expect(scoreResponse(essay, { text: '' })).toEqual({ score: 0, verdict: 'blank' });
    expect(scoreResponse(essay, { text: '  \n\t ' })).toEqual({ score: 0, verdict: 'blank' });
    expect(scoreResponse(essay, undefined)).toEqual({ score: 0, verdict: 'blank' });
  });
});

describe('dữ liệu lạ không làm hỏng việc chấm (Q289)', () => {
  it('Phương án không còn trong đề, kiểu sai, trùng lặp đều 0 điểm', () => {
    expect(scoreResponse(single, { optionId: 'zzz' })).toEqual({ score: 0, verdict: 'wrong' });
    expect(scoreResponse(single, 'o2')).toEqual({ score: 0, verdict: 'wrong' });
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'zzz'] }).score).toBe(0);
    expect(scoreResponse(multi('proportional'), { optionIds: ['o1', 'o1'] }).score).toBe(0);
    expect(scoreResponse(cluster('proportional'), answers({ zzz: true })).score).toBe(0);
    expect(scoreResponse(cluster('proportional'), { answers: { a: 'đúng' } }).score).toBe(0);
  });

  it('payload hỏng không ném lỗi', () => {
    const broken: ScoringItem = { type: 'multiple_choice', points: 1, payload: null };
    expect(scoreResponse(broken, { optionIds: ['o1'] })).toEqual({ score: 0, verdict: 'wrong' });
    const ladderBroken = cluster('ladder', [0, 1], 1);
    expect(scoreResponse(ladderBroken, answers({ a: true })).score).toBe(0);
  });
});

describe('Đáp án đúng đã Đính chính (keyOverride)', () => {
  it('chọn một và chọn nhiều dùng đáp án mới thay bản chụp', () => {
    expect(scoreResponse(single, { optionId: 'o2' }, ['o4']).score).toBe(0);
    expect(scoreResponse(single, { optionId: 'o4' }, ['o4']).score).toBe(0.25);
    expect(scoreResponse(multi('all_or_nothing'), { optionIds: ['o4'] }, ['o4']).score).toBe(2);
  });

  it('chùm dùng bảng Mệnh đề mới', () => {
    const flipped = { a: false, b: true, c: false, d: true };
    expect(scoreResponse(cluster('all_or_nothing'), answers(flipped), flipped).score).toBe(1);
  });
});

describe('tính chất', () => {
  it('điểm luôn trong [0, tối đa] và đúng thêm một Mệnh đề không làm giảm điểm (bậc thang)', () => {
    const item = cluster('ladder', [0, 0.1, 0.25, 0.5, 1], 1.5);
    const ids = ['a', 'b', 'c', 'd'] as const;
    const key = { a: true, b: false, c: true, d: false };
    let previous = -1;
    for (let k = 0; k <= 4; k++) {
      const given: Record<string, boolean> = {};
      ids.forEach((id, i) => {
        given[id] = i < k ? key[id] : !key[id];
      });
      const { score } = scoreResponse(item, { answers: given });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1.5);
      expect(score as number).toBeGreaterThanOrEqual(previous);
      previous = score as number;
    }
  });

  it('không có số lẻ nhị phân: 0,1 điểm × 3 câu cộng lại đúng 0,3 khi tính bằng centi', () => {
    const tenth: ScoringItem = {
      type: 'single_choice',
      points: 0.1,
      payload: { options, key: ['o1'] },
    };
    const total = [1, 2, 3].reduce(
      (s) => s + (scoreResponse(tenth, { optionId: 'o1' }).score as number) * 100,
      0,
    );
    expect(total).toBe(30);
  });
});
