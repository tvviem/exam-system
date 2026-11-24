import { describe, expect, it } from 'vitest';
import { questionRowInfo } from './question-row';

// Hàng của Ngân hàng câu hỏi: chỉ hiện thông tin có ích, không lặp ở mọi dòng
// (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U1, quyết định D1).
const used = { usage: { draftCount: 1, publishedCount: 0 }, archivedAt: null };
const usedPublished = { usage: { draftCount: 0, publishedCount: 2 }, archivedAt: null };
const unused = { usage: { draftCount: 0, publishedCount: 0 }, archivedAt: null };
const archivedUnused = {
  usage: { draftCount: 0, publishedCount: 0 },
  archivedAt: '2026-11-20T00:00:00Z',
};

describe('questionRowInfo', () => {
  it('đang xem mọi Chủ đề thì hiện tên Chủ đề ở dòng phụ', () => {
    expect(questionRowInfo(used, { topicFiltered: false }).showTopic).toBe(true);
  });

  it('đã chọn một Chủ đề thì không lặp tên Chủ đề (thanh bên đã nêu)', () => {
    expect(questionRowInfo(used, { topicFiltered: true }).showTopic).toBe(false);
  });

  it('câu đã nằm trong Bộ đề (nháp hoặc đã Phát hành) thì không có nhãn dùng ở', () => {
    expect(questionRowInfo(used, { topicFiltered: false }).unused).toBe(false);
    expect(questionRowInfo(usedPublished, { topicFiltered: false }).unused).toBe(false);
  });

  it('câu chưa vào Bộ đề nào thì có nhãn "chưa dùng"', () => {
    expect(questionRowInfo(unused, { topicFiltered: false }).unused).toBe(true);
  });

  it('câu đã Lưu trữ chỉ mang nhãn Lưu trữ, không thêm "chưa dùng"', () => {
    const info = questionRowInfo(archivedUnused, { topicFiltered: false });
    expect(info.archived).toBe(true);
    expect(info.unused).toBe(false);
  });

  it('câu đang dùng không bị coi là Lưu trữ', () => {
    expect(questionRowInfo(used, { topicFiltered: false }).archived).toBe(false);
  });
});
