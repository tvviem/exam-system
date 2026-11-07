import { describe, expect, it } from 'vitest';
import { parseScore, quickScores } from './grading-screen';

describe('quickScores: năm nút điểm nhanh theo điểm tối đa của câu', () => {
  it('câu 2 điểm: 0, 0,5, 1, 1,5, 2', () => {
    expect(quickScores(2)).toEqual([0, 0.5, 1, 1.5, 2]);
  });
  it('câu 3 điểm: 0, 0,75, 1,5, 2,25, 3; câu 5 điểm: 0, 1,25, 2,5, 3,75, 5', () => {
    expect(quickScores(3)).toEqual([0, 0.75, 1.5, 2.25, 3]);
    expect(quickScores(5)).toEqual([0, 1.25, 2.5, 3.75, 5]);
  });
  it('làm tròn đến 0,01 (câu 1,05 điểm)', () => {
    expect(quickScores(1.05)).toEqual([0, 0.26, 0.53, 0.79, 1.05]);
  });
});

describe('parseScore: ô "Điểm khác"', () => {
  it('nhận dấu phẩy và dấu chấm thập phân', () => {
    expect(parseScore('1,25', 2)).toEqual({ value: 1.25 });
    expect(parseScore(' 0.5 ', 2)).toEqual({ value: 0.5 });
    expect(parseScore('2', 2)).toEqual({ value: 2 });
  });
  it('để trống là chưa nhập', () => {
    expect(parseScore('  ', 2)).toEqual({ value: null });
  });
  it('ngoài [0, tối đa] hoặc không phải số là lỗi khoảng', () => {
    expect(parseScore('2,01', 2)).toEqual({ value: null, error: 'range' });
    expect(parseScore('-1', 2)).toEqual({ value: null, error: 'range' });
    expect(parseScore('abc', 2)).toEqual({ value: null, error: 'range' });
  });
  it('quá 2 chữ số thập phân là lỗi', () => {
    expect(parseScore('1,255', 2)).toEqual({ value: null, error: 'decimals' });
  });
});
