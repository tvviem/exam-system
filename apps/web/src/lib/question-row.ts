import type { QuestionListItem } from './question-bank';

// Hàng của Ngân hàng câu hỏi: chỉ nêu thông tin có ích, không lặp ở mọi dòng
// (docs/plan/ux-ra-soat-sau-0-5-1-thiet-ke.md, U1, quyết định D1).

export interface QuestionRowInfo {
  /** Hiện tên Chủ đề ở dòng phụ (không hiện khi đã chọn một Chủ đề: thanh bên đã nêu). */
  showTopic: boolean;
  /** Câu chưa nằm trong Bộ đề nào. Câu đã dùng là trạng thái thường, không cần nhãn. */
  unused: boolean;
  archived: boolean;
}

export function questionRowInfo(
  item: Pick<QuestionListItem, 'usage' | 'archivedAt'>,
  context: { topicFiltered: boolean },
): QuestionRowInfo {
  const archived = item.archivedAt !== null;
  const inExams = item.usage.draftCount + item.usage.publishedCount > 0;
  return { showTopic: !context.topicFiltered, unused: !archived && !inExams, archived };
}
