import { type QuestionInput, searchTextOf } from '@exam/shared';

/** Giá trị cột của bảng `questions` cho một Câu hỏi (không gồm `ownerId`); dùng chung cho soạn tay và nhập Excel. */
export function questionColumnsOf(input: QuestionInput) {
  return {
    topicId: input.topicId,
    type: input.type,
    stem: input.stem,
    payload: input.payload,
    defaultPoints: String(input.defaultPoints),
    tags: input.tags,
    searchText: searchTextOf(input),
  };
}
