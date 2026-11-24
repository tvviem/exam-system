import { textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import type { DraftSection, ExamDraft } from './exam-draft';
import { filterExamItems, tagsOfExam } from './exam-filter';

// Lọc câu hỏi trên trang Bộ đề đã phát hành: theo một phần nội dung hoặc tag, không phân biệt hoa thường và dấu.

const q = (id: string, preview: string, tags: string[] = []) => ({
  questionId: id,
  points: 1,
  question: {
    type: 'single_choice' as const,
    preview,
    topicName: 'Chủ đề',
    tags,
    defaultPoints: 1,
    archived: false,
  },
});
const section = (key: string, items: ReturnType<typeof q>[]): DraftSection => ({
  key,
  title: key,
  instructions: textDoc(''),
  drawPercent: 100,
  items,
});
const exam: ExamDraft = {
  title: 'Đề',
  instructions: textDoc(''),
  sections: [
    section('A', [
      q('a1', 'Tính tích phân của hàm số', ['giải tích', 'chương 4']),
      q('a2', 'Đạo hàm của x²', ['giải tích']),
      q('a3', 'Giới hạn dãy số', ['Chương 4']),
    ]),
    section('B', [
      q('b1', 'Cấu trúc dữ liệu: ngăn xếp', ['tin học']),
      q('b2', 'TÍCH VÔ HƯỚNG hai vectơ', []),
    ]),
  ],
};

describe('tagsOfExam: các tag có trong Bộ đề để chọn lọc', () => {
  it('không trùng (không phân biệt hoa thường), theo thứ tự chữ cái', () => {
    expect(tagsOfExam(exam)).toEqual(['chương 4', 'giải tích', 'tin học']);
  });
  it('Bộ đề không có tag thì rỗng', () => {
    expect(tagsOfExam({ ...exam, sections: [section('A', [q('x', 'câu')])] })).toEqual([]);
  });
});

describe('filterExamItems: lọc theo nội dung', () => {
  it('lọc trống là tất cả, không đang lọc', () => {
    const result = filterExamItems(exam, { query: '  ', tag: '' });
    expect(result.active).toBe(false);
    expect(result.shown).toBe(5);
    expect(result.total).toBe(5);
    expect([...result.visible].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });
  it('không phân biệt hoa thường và dấu: "tich" khớp nội dung "tích phân", "TÍCH VÔ HƯỚNG" và cả tag "giải tích"', () => {
    const result = filterExamItems(exam, { query: 'tich', tag: '' });
    expect(result.active).toBe(true);
    expect([...result.visible].sort()).toEqual(['a1', 'a2', 'b2']);
    expect(result.shown).toBe(3);
    expect(result.perSection.get('A')).toBe(2);
    expect(result.perSection.get('B')).toBe(1);
  });
  it('gõ "đạo hàm" (có đ) khớp "Đạo hàm"; gõ nhiều từ phải khớp chuỗi liền', () => {
    expect([...filterExamItems(exam, { query: 'dao ham', tag: '' }).visible]).toEqual(['a2']);
    expect(filterExamItems(exam, { query: 'phan tich', tag: '' }).shown).toBe(0);
  });
  it('khớp cả tag: "chuong" khớp tag "chương 4" và "Chương 4"', () => {
    expect([...filterExamItems(exam, { query: 'chuong', tag: '' }).visible].sort()).toEqual([
      'a1',
      'a3',
    ]);
  });
});

describe('filterExamItems: lọc theo tag và kết hợp', () => {
  it('chọn tag: chỉ câu có đúng tag đó (không phân biệt hoa thường)', () => {
    const result = filterExamItems(exam, { query: '', tag: 'chương 4' });
    expect([...result.visible].sort()).toEqual(['a1', 'a3']);
    expect(result.active).toBe(true);
  });
  it('kết hợp nội dung và tag: phải thỏa cả hai', () => {
    expect([...filterExamItems(exam, { query: 'dao ham', tag: 'giải tích' }).visible]).toEqual([
      'a2',
    ]);
    // Có câu khớp nội dung nhưng không có tag đã chọn thì không hiện.
    expect(filterExamItems(exam, { query: 'dao ham', tag: 'tin học' }).shown).toBe(0);
    // Tag chọn khớp nhưng nội dung không khớp thì không hiện.
    expect([...filterExamItems(exam, { query: 'gioi han', tag: 'chương 4' }).visible]).toEqual([
      'a3',
    ]);
  });
  it('đếm từng Phần, Phần không còn câu khớp có số 0 (để ghi "Không có câu khớp")', () => {
    const result = filterExamItems(exam, { query: 'ngan xep', tag: '' });
    expect(result.perSection.get('A')).toBe(0);
    expect(result.perSection.get('B')).toBe(1);
    expect(result.shown).toBe(1);
    expect(result.total).toBe(5);
  });
});
