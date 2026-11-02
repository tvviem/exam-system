import { type CandidateSource, candidateViewOf } from '@exam/shared';
import type { ContentSnapshot, ExamContentData } from '../../common/exam-content';
import type { StoredLayout } from './attempt.schema';

// Nội dung đề gửi cho Người dự thi (Q232). Mọi câu đi qua `candidateViewOf` (xây mới từ danh sách trường cho phép), nên
// Đáp án đúng (`key`) và hướng dẫn chấm (`rubric`) không thể lọt vào; `scoringRule`, `ladder` chỉ hiện khi Phiên thi bật.

export interface SavedResponse {
  value: unknown;
  flagged: boolean;
  /** Số thứ tự lần lưu của chính câu này; máy khác tiếp tục đếm từ đây (Q241). */
  clientSeq: number;
}

export interface ViewItem {
  itemId: string;
  no: number;
  points: number;
  type: ContentSnapshot['type'];
  stem: unknown;
  payload: unknown;
  illustrations: ContentSnapshot['illustrations'];
  response: SavedResponse | null;
}

export interface ViewSection {
  id: string;
  title: string | null;
  instructions: unknown;
  items: ViewItem[];
}

/** Đưa Phương án về thứ tự của Lượt (`optionOrder`); thiếu thì giữ thứ tự gốc. */
function reorderOptions(view: ReturnType<typeof candidateViewOf>, order: string[] | undefined) {
  if (!order || !('options' in view.payload)) return view.payload;
  const byId = new Map(view.payload.options.map((option) => [option.id, option]));
  const options = order.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
  return { ...view.payload, options };
}

export function buildAttemptSections(input: {
  content: ExamContentData;
  layout: StoredLayout;
  responses: Map<string, SavedResponse>;
  showScoringRules: boolean;
}): ViewSection[] {
  const { content, layout, responses, showScoringRules } = input;
  const itemsById = new Map(
    content.sections.flatMap((s) => s.items).map((item) => [item.itemId, item]),
  );
  const sectionsById = new Map(content.sections.map((section) => [section.id, section]));
  let no = 0;
  return layout.sections.flatMap((laid) => {
    const section = sectionsById.get(laid.sectionId);
    if (!section) return [];
    const items = laid.items.flatMap((entry): ViewItem[] => {
      const item = itemsById.get(entry.itemId);
      if (!item) return [];
      const view = candidateViewOf(item.snapshot as unknown as CandidateSource, {
        showScoringRules,
      });
      no += 1;
      return [
        {
          itemId: item.itemId,
          no,
          points: item.points,
          type: view.type,
          stem: view.stem,
          payload: reorderOptions(view, entry.optionOrder),
          illustrations: item.snapshot.illustrations,
          response: responses.get(item.itemId) ?? null,
        },
      ];
    });
    return [{ id: section.id, title: section.title, instructions: section.instructions, items }];
  });
}
