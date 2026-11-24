import { describe, expect, it } from 'vitest';
import { primaryResultsAction } from './results-actions';

// Màn Kết quả: mỗi lúc chỉ MỘT nút là việc nên làm tiếp (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U3).
describe('primaryResultsAction: nút chính của màn Kết quả', () => {
  it('còn bài tự luận chờ chấm thì Chấm tự luận là nút chính, chưa phải Công bố', () => {
    expect(primaryResultsAction({ pendingEssays: 3, released: false, appealsOpen: 0 })).toBe(
      'grade',
    );
  });

  it('hết bài chờ chấm mà chưa Công bố thì Công bố là nút chính (kể cả khi đang bị khóa vì lý do khác)', () => {
    expect(primaryResultsAction({ pendingEssays: 0, released: false, appealsOpen: 0 })).toBe(
      'release',
    );
  });

  it('đã Công bố và còn Phúc khảo chưa xử lý thì Xử lý Phúc khảo là nút chính', () => {
    expect(primaryResultsAction({ pendingEssays: 0, released: true, appealsOpen: 2 })).toBe(
      'appeals',
    );
  });

  it('đã Công bố, không còn Phúc khảo mở thì không có nút nào cần nhấn mạnh', () => {
    expect(primaryResultsAction({ pendingEssays: 0, released: true, appealsOpen: 0 })).toBeNull();
  });

  it('đã Công bố thì không còn nút Chấm làm nút chính dù số bài chờ chấm còn ghi lại', () => {
    expect(primaryResultsAction({ pendingEssays: 1, released: true, appealsOpen: 0 })).toBeNull();
  });
});
