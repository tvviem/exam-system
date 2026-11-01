import { EXAM_MAX_ITEMS, EXAM_MAX_SECTIONS, examContentSchema, textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import {
  addItems,
  addSection,
  type DraftQuestion,
  type ExamDraft,
  moveItem,
  moveItemToSection,
  moveSection,
  newDraft,
  numberOf,
  questionIdsOf,
  removeItem,
  removeSection,
  setPoints,
  toContent,
  totalsOf,
} from './exam-draft';

const brief: DraftQuestion = {
  type: 'single_choice',
  preview: 'Câu',
  topicName: 'Giải tích',
  tags: [],
  defaultPoints: 1,
  archived: false,
};
const q = (id: string, defaultPoints = 1) => ({ id, ...brief, defaultPoints });
const ids = (draft: ExamDraft) => draft.sections.map((s) => s.items.map((i) => i.questionId));
const id = (n: number) => `0197a6f0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** Hai Phần: [1, 2, 3] và [4]. */
function sample(): ExamDraft {
  let draft = addSection(newDraft('Đề'), 's2');
  const [first] = draft.sections;
  if (!first) throw new Error('thiếu Phần');
  draft = addItems(draft, first.key, [q(id(1)), q(id(2)), q(id(3))]).draft;
  draft = addItems(draft, 's2', [q(id(4))]).draft;
  return draft;
}

describe('bản nháp Bộ đề (Q161–Q164)', () => {
  it('Bộ đề mới có đúng một Phần mặc định không tiêu đề', () => {
    const draft = newDraft('Giữa kỳ');
    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]).toMatchObject({ title: '', items: [] });
  });

  it('thêm câu vào Phần: điểm khởi tạo là điểm mặc định; câu đã có bị bỏ qua', () => {
    const draft = newDraft('Đề');
    const key = draft.sections[0]?.key as string;
    const first = addItems(draft, key, [q(id(1), 2.5), q(id(2))]);
    expect(first.added).toBe(2);
    expect(first.draft.sections[0]?.items.map((i) => i.points)).toEqual([2.5, 1]);
    const again = addItems(first.draft, key, [q(id(2)), q(id(3))]);
    expect(again.added).toBe(1);
    expect(ids(again.draft)).toEqual([[id(1), id(2), id(3)]]);
  });

  it(`không vượt ${EXAM_MAX_ITEMS} câu: thêm đến đủ rồi dừng`, () => {
    const draft = newDraft('Đề');
    const key = draft.sections[0]?.key as string;
    const many = Array.from({ length: EXAM_MAX_ITEMS + 5 }, (_, i) => q(id(i + 1)));
    const result = addItems(draft, key, many);
    expect(result.added).toBe(EXAM_MAX_ITEMS);
    expect(totalsOf(result.draft).items).toBe(EXAM_MAX_ITEMS);
    expect(addItems(result.draft, key, [q(id(999))]).added).toBe(0);
  });

  it('gỡ câu', () => {
    expect(ids(removeItem(sample(), id(2)))).toEqual([[id(1), id(3)], [id(4)]]);
  });

  it('Lên và Xuống đổi chỗ trong Phần, không vượt biên', () => {
    expect(ids(moveItem(sample(), id(2), -1))[0]).toEqual([id(2), id(1), id(3)]);
    expect(ids(moveItem(sample(), id(2), 1))[0]).toEqual([id(1), id(3), id(2)]);
    expect(ids(moveItem(sample(), id(1), -1))).toEqual(ids(sample()));
    expect(ids(moveItem(sample(), id(3), 1))).toEqual(ids(sample()));
    expect(ids(moveItem(sample(), id(4), -1))).toEqual(ids(sample())); // đầu Phần 2 không nhảy sang Phần 1
  });

  it('chuyển sang Phần khác: nằm cuối Phần đích, giữ điểm đã đặt', () => {
    const draft = setPoints(sample(), id(2), 3);
    const moved = moveItemToSection(draft, id(2), 's2');
    expect(ids(moved)).toEqual([
      [id(1), id(3)],
      [id(4), id(2)],
    ]);
    expect(moved.sections[1]?.items[1]?.points).toBe(3);
  });

  it('đổi vị trí Phần bằng Lên và Xuống', () => {
    const draft = sample();
    const first = draft.sections[0]?.key as string;
    expect(moveSection(draft, first, 1).sections.map((s) => s.key)).toEqual(['s2', first]);
    expect(moveSection(draft, first, -1).sections.map((s) => s.key)).toEqual([first, 's2']);
  });

  it(`tối đa ${EXAM_MAX_SECTIONS} Phần; luôn còn ít nhất một`, () => {
    let draft = newDraft('Đề');
    for (let i = 0; i < EXAM_MAX_SECTIONS + 3; i++) draft = addSection(draft, `k${i}`);
    expect(draft.sections).toHaveLength(EXAM_MAX_SECTIONS);
    let single = newDraft('Đề');
    single = removeSection(single, single.sections[0]?.key as string);
    expect(single.sections).toHaveLength(1);
  });

  it('xóa Phần xóa luôn các câu trong Phần đó', () => {
    const removed = removeSection(sample(), 's2');
    expect(ids(removed)).toEqual([[id(1), id(2), id(3)]]);
  });

  it('tổng số câu và tổng điểm tính chính xác (không sai số số thực)', () => {
    let draft = newDraft('Đề');
    const key = draft.sections[0]?.key as string;
    draft = addItems(draft, key, [q(id(1), 0.1), q(id(2), 0.2), q(id(3), 0.05)]).draft;
    expect(totalsOf(draft)).toEqual({ items: 3, points: 0.35 });
  });

  it('số thứ tự câu đánh liên tục qua các Phần', () => {
    const draft = sample();
    expect([id(1), id(2), id(3), id(4)].map((x) => numberOf(draft, x))).toEqual([1, 2, 3, 4]);
    expect(numberOf(draft, 'không có')).toBeNull();
  });

  it('tập id câu đang có trong Bộ đề', () => {
    expect([...questionIdsOf(sample())].sort()).toEqual([id(1), id(2), id(3), id(4)]);
  });

  it('toContent cho ra nội dung đúng schema dùng chung; Phần không tiêu đề gửi null, Phần cũ giữ id', () => {
    const draft = sample();
    const base = {
      ...draft,
      sections: draft.sections.map((s, i) =>
        i === 0 ? { ...s, id: id(500), title: '  Phần I ' } : s,
      ),
    };
    const content = toContent({ ...base, instructions: textDoc('Hướng dẫn') }, 7);
    expect(examContentSchema.safeParse(content).success).toBe(true);
    expect(content.version).toBe(7);
    expect(content.sections[0]).toMatchObject({ id: id(500), title: 'Phần I' });
    expect(content.sections[1]).toMatchObject({ title: null });
    expect(content.sections[1]).not.toHaveProperty('id');
    expect(content.sections[0]?.items[0]).toEqual({ questionId: id(1), points: 1 });
  });
});
