import type { RichText } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import { hasRichText, oneModeContext } from './one-mode';

// Chế độ "Từng câu": trên câu hỏi chỉ còn một dòng nhãn Phần; hướng dẫn của Phần chỉ hiện sẵn ở câu đầu của Phần
// (docs/plan/take-tung-cau-thiet-ke.md).
const text = (value: string): RichText => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const emptyDoc: RichText = { type: 'doc', content: [{ type: 'paragraph' }] };
const items = (n: number) => Array.from({ length: n }, () => ({}));

const sections = [
  { title: 'Phần I', instructions: text('Chọn một đáp án.'), items: items(3) },
  { title: 'Phần II', instructions: emptyDoc, items: items(2) },
  { title: null, instructions: null, items: items(2) },
];

describe('hasRichText: có nội dung thật (không phải đoạn văn rỗng)', () => {
  it('đoạn có chữ là có', () => expect(hasRichText(text('a'))).toBe(true));
  it('đoạn văn rỗng, null hay undefined là không', () => {
    expect(hasRichText(emptyDoc)).toBe(false);
    expect(hasRichText(null)).toBe(false);
    expect(hasRichText(undefined)).toBe(false);
  });
});

describe('oneModeContext', () => {
  it('câu đầu của Phần có hướng dẫn: hiện sẵn hướng dẫn, neo cuộn ở đầu khối Phần', () => {
    expect(oneModeContext(sections, 0, false)).toMatchObject({
      sectionTitle: 'Phần I',
      introVisible: true,
      anchor: 'section',
    });
  });

  it('câu giữa Phần: không hiện sẵn hướng dẫn, neo cuộn ở đầu thẻ câu hỏi', () => {
    expect(oneModeContext(sections, 1, false)).toMatchObject({
      sectionTitle: 'Phần I',
      introVisible: false,
      anchor: 'question',
    });
    expect(oneModeContext(sections, 2, false)?.anchor).toBe('question');
  });

  it('câu đầu của Phần có tên nhưng hướng dẫn rỗng: không có hướng dẫn, vẫn neo ở đầu Phần để thấy Phần mới', () => {
    // chỉ số 3 là câu đầu của Phần II (3 câu của Phần I đứng trước)
    expect(oneModeContext(sections, 3, false)).toMatchObject({
      sectionTitle: 'Phần II',
      introVisible: false,
      anchor: 'section',
    });
  });

  it('Phần không tên, không hướng dẫn: không nhãn, neo ở đầu thẻ câu hỏi dù là câu đầu', () => {
    expect(oneModeContext(sections, 5, false)).toMatchObject({
      sectionTitle: null,
      introVisible: false,
      anchor: 'question',
    });
  });

  it('nút Hướng dẫn chỉ có khi đề hoặc Phần hiện tại có hướng dẫn', () => {
    expect(oneModeContext(sections, 1, false)?.guideAvailable).toBe(true); // Phần I có hướng dẫn
    expect(oneModeContext(sections, 4, false)?.guideAvailable).toBe(false); // Phần II rỗng, đề không có
    expect(oneModeContext(sections, 4, true)?.guideAvailable).toBe(true); // đề có hướng dẫn
    expect(oneModeContext(sections, 6, false)?.guideAvailable).toBe(false);
  });

  it('chỉ số ngoài phạm vi thì không có ngữ cảnh', () => {
    expect(oneModeContext(sections, -1, false)).toBeNull();
    expect(oneModeContext(sections, 7, false)).toBeNull();
    expect(oneModeContext([], 0, false)).toBeNull();
  });
});
