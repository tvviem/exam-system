import type { RichText } from '@exam/shared';

// Chế độ "Từng câu" (docs/plan/take-tung-cau-thiet-ke.md): câu hỏi là trung tâm. Trên thẻ câu hỏi chỉ còn một dòng nhãn Phần và nút
// "Hướng dẫn"; hướng dẫn của Phần chỉ hiện sẵn ở câu đầu của Phần; mỗi lần chuyển câu, trang cuộn tới đầu câu hỏi (hay đầu khối Phần
// nếu vừa sang Phần mới) ngay dưới thanh đầu.

/** Có nội dung thật: không phải null hay chỉ toàn đoạn văn rỗng. */
export function hasRichText(doc: RichText | null | undefined): boolean {
  return (doc?.content ?? []).some(
    (block) => block.type !== 'paragraph' || (block.content ?? []).length > 0,
  );
}

export interface OneModeContext {
  /** Tên Phần của câu đang làm (null nếu Phần không tên). */
  sectionTitle: string | null;
  /** Hướng dẫn của Phần hiện sẵn dưới dòng nhãn: chỉ ở câu đầu của Phần, và chỉ khi Phần có hướng dẫn. */
  introVisible: boolean;
  /** Có hướng dẫn nào để mở bằng nút "Hướng dẫn" (của đề hoặc của Phần hiện tại). */
  guideAvailable: boolean;
  /** Chuyển câu thì cuộn tới đâu: đầu khối Phần (vừa sang Phần có tên hay có hướng dẫn) hoặc đầu thẻ câu hỏi. */
  anchor: 'section' | 'question';
}

/** `index` đếm trên toàn bộ câu của đề, theo thứ tự các Phần. */
export function oneModeContext(
  sections: readonly {
    title: string | null;
    instructions: RichText | null;
    items: readonly unknown[];
  }[],
  index: number,
  examHasInstructions: boolean,
): OneModeContext | null {
  if (index < 0) return null;
  let start = 0;
  for (const section of sections) {
    if (index < start + section.items.length) {
      const sectionHasInstructions = hasRichText(section.instructions);
      const sectionStart = index === start;
      const title = section.title?.trim() ? section.title : null;
      const introVisible = sectionStart && sectionHasInstructions;
      return {
        sectionTitle: title,
        introVisible,
        guideAvailable: examHasInstructions || sectionHasInstructions,
        anchor: sectionStart && (introVisible || title !== null) ? 'section' : 'question',
      };
    }
    start += section.items.length;
  }
  return null;
}
