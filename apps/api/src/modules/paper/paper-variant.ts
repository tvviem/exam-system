import type { ExamContentData } from '../../common/exam-content';

/**
 * Nội dung Bộ đề chỉ còn các câu của một Mã đề (Phiên thi dùng chung Mã đề), giữ thứ tự gốc; Phần không còn câu nào thì bỏ để
 * tệp không có đầu mục Phần trống. Số thứ tự câu trong tệp tính lại theo bộ câu của Mã đề.
 */
export function restrictToVariant(
  content: ExamContentData,
  itemIds: ReadonlySet<string>,
): ExamContentData {
  return {
    ...content,
    sections: content.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => itemIds.has(item.itemId)),
      }))
      .filter((section) => section.items.length > 0),
  };
}
