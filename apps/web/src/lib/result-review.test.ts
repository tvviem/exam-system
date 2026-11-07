import { describe, expect, it } from 'vitest';
import {
  countVerdicts,
  indexOfNo,
  matchesFilter,
  nextWrongIndex,
  type ReviewVerdict,
  stepIndex,
} from './result-review';

const items = (verdicts: ReviewVerdict[]) =>
  verdicts.map((verdict, index) => ({ no: index + 1, verdict }));

describe('countVerdicts', () => {
  it('đếm từng loại kết quả', () => {
    const counts = countVerdicts(
      items(['correct', 'wrong', 'correct', 'partial', 'blank', 'wrong']),
    );
    expect(counts).toEqual({ correct: 2, partial: 1, wrong: 2, blank: 1 });
  });

  it('không có câu nào thì mọi số bằng 0', () => {
    expect(countVerdicts([])).toEqual({ correct: 0, partial: 0, wrong: 0, blank: 0 });
  });
});

describe('matchesFilter', () => {
  it('không lọc thì câu nào cũng khớp', () => {
    expect(matchesFilter({ verdict: 'blank' }, null)).toBe(true);
  });

  it('lọc thì chỉ khớp đúng loại', () => {
    expect(matchesFilter({ verdict: 'wrong' }, 'wrong')).toBe(true);
    expect(matchesFilter({ verdict: 'partial' }, 'wrong')).toBe(false);
  });
});

describe('stepIndex', () => {
  const list = items(['correct', 'wrong', 'correct', 'wrong', 'blank']);

  it('không lọc thì đi từng câu và dừng ở hai đầu', () => {
    expect(stepIndex(list, 0, null, 1)).toBe(1);
    expect(stepIndex(list, 4, null, 1)).toBeNull();
    expect(stepIndex(list, 0, null, -1)).toBeNull();
    expect(stepIndex(list, 3, null, -1)).toBe(2);
  });

  it('có lọc thì nhảy qua các câu không khớp, cả hai hướng', () => {
    expect(stepIndex(list, 0, 'wrong', 1)).toBe(1);
    expect(stepIndex(list, 1, 'wrong', 1)).toBe(3);
    expect(stepIndex(list, 3, 'wrong', 1)).toBeNull();
    expect(stepIndex(list, 3, 'wrong', -1)).toBe(1);
  });

  it('đứng ở câu không khớp bộ lọc vẫn đi tới câu khớp gần nhất', () => {
    expect(stepIndex(list, 2, 'wrong', 1)).toBe(3);
    expect(stepIndex(list, 2, 'wrong', -1)).toBe(1);
  });
});

describe('nextWrongIndex', () => {
  it('lấy câu sai kế tiếp phía sau', () => {
    expect(nextWrongIndex(items(['wrong', 'correct', 'wrong']), 0)).toBe(2);
  });

  it('hết câu sai phía sau thì quay về câu sai đầu tiên', () => {
    expect(nextWrongIndex(items(['wrong', 'correct', 'correct']), 2)).toBe(0);
  });

  it('chỉ có đúng câu đang xem là câu sai thì không có câu khác', () => {
    expect(nextWrongIndex(items(['correct', 'wrong', 'correct']), 1)).toBeNull();
  });

  it('không có câu sai nào', () => {
    expect(nextWrongIndex(items(['correct', 'partial', 'blank']), 0)).toBeNull();
  });
});

describe('indexOfNo', () => {
  const list = items(['correct', 'wrong', 'blank']);

  it('tìm theo số câu Người dự thi đã thấy', () => {
    expect(indexOfNo(list, 3)).toBe(2);
  });

  it('thiếu, ngoài khoảng hoặc không có thì về câu đầu', () => {
    expect(indexOfNo(list, undefined)).toBe(0);
    expect(indexOfNo(list, 99)).toBe(0);
    expect(indexOfNo([], 2)).toBe(0);
  });
});
