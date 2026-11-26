import { describe, expect, it } from 'vitest';
import { cappedPageParam } from './page-param';

// Danh sách lớn chỉ cho lật tới 10.000 kết quả đầu (docs/plan/quy-mo-lon-thiet-ke.md mục 6.1): địa chỉ trỏ quá thì về trang cuối.

describe('tham số trang của danh sách lớn', () => {
  it('trang 1 hay giá trị lạ thì bỏ khỏi địa chỉ', () => {
    for (const value of [undefined, 1, 0, -3, 'abc']) {
      expect(cappedPageParam(value)).toBeUndefined();
    }
  });

  it('trang hợp lệ giữ nguyên; quá trang cuối cho phép (500, mỗi trang 20) thì về 500', () => {
    expect(cappedPageParam(2)).toBe(2);
    expect(cappedPageParam('500')).toBe(500);
    expect(cappedPageParam(501)).toBe(500);
    expect(cappedPageParam('900000')).toBe(500);
  });
});
