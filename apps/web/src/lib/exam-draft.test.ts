import { EXAM_MAX_ITEMS, EXAM_MAX_SECTIONS, examContentSchema, textDoc } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import {
  addItems,
  addSection,
  applyPoints,
  type DraftQuestion,
  draftFromExam,
  drawPercentValid,
  drawSummaryOf,
  type ExamDraft,
  moveItem,
  moveItemToSection,
  moveSection,
  newDraft,
  numberFromText,
  numberOf,
  questionIdsOf,
  removeItem,
  removeSection,
  setDrawPercent,
  setPoints,
  textForNumber,
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

describe('Đặt điểm nhanh trên bản nháp (Q168)', () => {
  /** Phần 1: [chọn một, tự luận, chọn một]; Phần 2: [chọn một]. */
  const typed = (): ExamDraft => {
    let draft = addSection(newDraft('Đề'), 's2');
    const first = draft.sections[0]?.key as string;
    draft = addItems(draft, first, [q(id(1)), { ...q(id(2)), type: 'essay' }, q(id(3))]).draft;
    return addItems(draft, 's2', [q(id(4))]).draft;
  };
  const pointsOf = (draft: ExamDraft) => draft.sections.map((s) => s.items.map((i) => i.points));

  it('cả Bộ đề: 4 câu mỗi câu 0,25', () => {
    const result = applyPoints(typed(), { kind: 'all' }, { kind: 'each', points: 0.25 });
    expect(result.ok && result.count).toBe(4);
    expect(result.ok && pointsOf(result.draft)).toEqual([[0.25, 0.25, 0.25], [0.25]]);
  });

  it('một Phần: chỉ đổi câu của Phần đó, chia đều tổng', () => {
    const draft = typed();
    const first = draft.sections[0]?.key as string;
    const result = applyPoints(draft, { kind: 'section', key: first }, { kind: 'total', total: 3 });
    expect(result.ok && pointsOf(result.draft)).toEqual([[1, 1, 1], [1]]);
  });

  it('một Loại: chỉ đổi câu thuộc Loại đó; không có câu nào thì báo empty', () => {
    const result = applyPoints(
      typed(),
      { kind: 'type', type: 'essay' },
      { kind: 'each', points: 5 },
    );
    expect(result.ok && pointsOf(result.draft)).toEqual([[1, 5, 1], [1]]);
    expect(
      applyPoints(
        typed(),
        { kind: 'type', type: 'true_false_cluster' },
        { kind: 'each', points: 5 },
      ),
    ).toEqual({
      ok: false,
      reason: 'empty',
    });
  });
});

describe('tỷ lệ rút của Phần (Rút câu, Q435 đến Q441)', () => {
  /** Phần A: 10 câu × 1 điểm; Phần B: 5 câu × 2 điểm. */
  function drawSample(): ExamDraft {
    let draft = addSection(newDraft('Đề'), 'b');
    const a = draft.sections[0]?.key as string;
    draft = addItems(
      draft,
      a,
      Array.from({ length: 10 }, (_, i) => q(id(i + 1), 1)),
    ).draft;
    draft = addItems(
      draft,
      'b',
      Array.from({ length: 5 }, (_, i) => q(id(i + 101), 2)),
    ).draft;
    // Khóa cố định để các bài kiểm lấy lại cùng một Phần qua nhiều lần dựng.
    return { ...draft, sections: draft.sections.map((s, n) => (n === 0 ? { ...s, key: 'a' } : s)) };
  }
  const keyA = () => 'a';

  it('Phần mới và Bộ đề mới lấy đủ (100 %), không đổi gì so với trước khi có Rút câu', () => {
    expect(newDraft('Đề').sections[0]?.drawPercent).toBe(100);
    expect(addSection(newDraft('Đề'), 'x').sections[1]?.drawPercent).toBe(100);
    expect(drawSummaryOf(drawSample())).toMatchObject({
      active: false,
      count: 15,
      maxPoints: 20,
      problems: [],
    });
  });

  it('đặt tỷ lệ chỉ đổi đúng Phần đó', () => {
    const draft = setDrawPercent(drawSample(), keyA(), 40);
    expect(draft.sections.map((s) => s.drawPercent)).toEqual([40, 100]);
  });

  it('drawPercentValid: 0 đến 100, tối đa hai chữ số lẻ; số lạ và để trống không hợp lệ', () => {
    for (const ok of [0, 0.01, 12.5, 40, 99.99, 100])
      expect(drawPercentValid(ok), String(ok)).toBe(true);
    for (const bad of [-0.01, 100.01, 33.333, Number.NaN, Number.POSITIVE_INFINITY])
      expect(drawPercentValid(bad), String(bad)).toBe(false);
  });

  it('tóm tắt: 40 % của 10 câu là 4 câu; mỗi người nhận 9 câu, tối đa 14 điểm', () => {
    const summary = drawSummaryOf(setDrawPercent(drawSample(), keyA(), 40));
    expect(summary).toMatchObject({ active: true, count: 9, maxPoints: 14, problems: [] });
    expect(summary.sections.map((s) => [s.count, s.total])).toEqual([
      [4, 10],
      [5, 5],
    ]);
  });

  it('Phần rút dưới 100 % mà các câu khác điểm: báo đúng Phần (Q441), không báo Phần 100 % hay 0 %', () => {
    let draft = setDrawPercent(drawSample(), keyA(), 40);
    draft = setPoints(draft, id(1), 3); // Phần A có câu 3 điểm và 1 điểm
    expect(drawSummaryOf(draft).problems).toEqual([
      { code: 'draw_points_uneven', sectionId: keyA() },
    ]);
    // Điểm tối đa không xác định khi còn Phần lệch điểm: ẩn (null) thay vì hiện số sai.
    expect(drawSummaryOf(draft).maxPoints).toBeNull();
    expect(drawSummaryOf(draft).count).toBe(9);
    // Phần A lấy đủ: 3 + 9 × 1 = 12; Phần B 5 × 2 = 10.
    expect(drawSummaryOf(setDrawPercent(draft, keyA(), 100)).maxPoints).toBe(22);
    expect(drawSummaryOf(setDrawPercent(draft, keyA(), 100)).problems).toEqual([]);
    expect(drawSummaryOf(setDrawPercent(draft, keyA(), 0)).problems).toEqual([]);
  });

  it('mọi Phần 0 % là vấn đề (Q440)', () => {
    let draft = setDrawPercent(drawSample(), keyA(), 0);
    draft = setDrawPercent(draft, 'b', 0);
    expect(drawSummaryOf(draft).problems).toEqual([{ code: 'draw_all_zero' }]);
  });

  it('tỷ lệ đang gõ dở (để trống) tính như 100 % để không nhảy số, và đánh dấu không hợp lệ', () => {
    const summary = drawSummaryOf(setDrawPercent(drawSample(), keyA(), Number.NaN));
    expect(summary.count).toBe(15);
    expect(summary.sections[0]?.valid).toBe(false);
    expect(summary.sections[1]?.valid).toBe(true);
  });

  it('gửi lên server: chỉ ghi drawPercent khi dưới 100 %; nội dung vẫn hợp lệ theo schema chung', () => {
    const draft = setDrawPercent(drawSample(), keyA(), 40);
    const content = toContent(draft, 3);
    expect(content.sections.map((s) => s.drawPercent)).toEqual([40, undefined]);
    expect(examContentSchema.safeParse(content).success).toBe(true);
    expect(toContent(drawSample(), 3).sections.every((s) => !('drawPercent' in s))).toBe(true);
  });

  it('nạp từ server: lấy drawPercent của Phần, thiếu thì 100', () => {
    const saved = {
      title: 'Đề',
      instructions: textDoc(''),
      sections: [
        { id: 's1', title: null, instructions: textDoc(''), drawPercent: 40, items: [] },
        { id: 's2', title: null, instructions: textDoc(''), items: [] },
      ],
    };
    expect(draftFromExam(saved).sections.map((s) => s.drawPercent)).toEqual([40, 100]);
  });
});

describe('ô số: chữ đang gõ và số trong bản nháp', () => {
  it('numberFromText: dấu phẩy hoặc chấm đều được; để trống là NaN, không phải 0', () => {
    expect(numberFromText('12,5')).toBe(12.5);
    expect(numberFromText('12.5')).toBe(12.5);
    expect(numberFromText('0')).toBe(0);
    expect(numberFromText('')).toBeNaN();
    expect(numberFromText('   ')).toBeNaN();
    expect(numberFromText('abc')).toBeNaN();
  });

  it('textForNumber: giữ chữ đang gõ khi vẫn ứng với số đó, kể cả để trống hoặc chưa gõ xong', () => {
    expect(textForNumber('', Number.NaN)).toBe(''); // lỗi cũ: hiện chữ "NaN"
    expect(textForNumber('abc', Number.NaN)).toBe('abc');
    expect(textForNumber('12,', 12)).toBe('12,');
    expect(textForNumber('12,50', 12.5)).toBe('12,50');
    expect(textForNumber('0', 0)).toBe('0');
  });

  it('textForNumber: số đổi từ bên ngoài (ví dụ Đặt điểm nhanh) thì chữ đổi theo', () => {
    expect(textForNumber('1', 3)).toBe('3');
    expect(textForNumber('', 5)).toBe('5');
    expect(textForNumber('abc', 7)).toBe('7');
  });
});
