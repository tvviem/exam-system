import { describe, expect, it } from 'vitest';
import {
  IMAGE_MAX_PER_QUESTION,
  MATH_MAX_PER_QUESTION,
  MATH_MAX_TOTAL_CHARS,
  questionInputSchema,
  searchTextOf,
} from './question.js';
import { textDoc } from './rich-text.js';

const TOPIC = '0197a6f0-0000-7000-8000-000000000001';
const opt = (id: string, value = `Phương án ${id}`) => ({ id, content: textDoc(value) });
const stmt = (id: string, key: boolean) => ({ id, content: textDoc(`Mệnh đề ${id}`), key });

const single = (over: Record<string, unknown> = {}) => ({
  type: 'single_choice',
  topicId: TOPIC,
  stem: textDoc('Đạo hàm của x² là gì?'),
  defaultPoints: 1,
  tags: [],
  payload: {
    options: [opt('o1'), opt('o2'), opt('o3')],
    key: ['o2'],
    shuffleOptions: true,
  },
  ...over,
});

const multiple = (payload: Record<string, unknown> = {}) => ({
  ...single(),
  type: 'multiple_choice',
  payload: {
    options: [opt('o1'), opt('o2'), opt('o3')],
    key: ['o1', 'o3'],
    scoringRule: 'proportional',
    shuffleOptions: true,
    ...payload,
  },
});

const cluster = (payload: Record<string, unknown> = {}) => ({
  ...single(),
  type: 'true_false_cluster',
  payload: {
    statements: [stmt('s1', true), stmt('s2', false), stmt('s3', true), stmt('s4', false)],
    scoringRule: 'proportional',
    ...payload,
  },
});

const essay = (payload: Record<string, unknown> = {}) => ({
  ...single(),
  type: 'essay',
  payload: { maxLength: 2000, ...payload },
});

const ok = (input: unknown) => questionInputSchema.safeParse(input).success;

describe('Câu chọn một', () => {
  it('hợp lệ với 2–8 Phương án và đúng một đáp án', () => {
    expect(ok(single())).toBe(true);
    const two = { options: [opt('o1'), opt('o2')], key: ['o1'], shuffleOptions: false };
    expect(ok(single({ payload: two }))).toBe(true);
    const eight = Array.from({ length: 8 }, (_, i) => opt(`o${i + 1}`));
    expect(ok(single({ payload: { options: eight, key: ['o8'], shuffleOptions: true } }))).toBe(
      true,
    );
  });

  it('từ chối 1 hoặc 9 Phương án', () => {
    const p = (n: number) => ({
      options: Array.from({ length: n }, (_, i) => opt(`o${i + 1}`)),
      key: ['o1'],
      shuffleOptions: true,
    });
    expect(ok(single({ payload: p(1) }))).toBe(false);
    expect(ok(single({ payload: p(9) }))).toBe(false);
  });

  it('từ chối đáp án thiếu, nhiều hơn một hoặc không thuộc Phương án nào', () => {
    const base = { options: [opt('o1'), opt('o2')], shuffleOptions: true };
    expect(ok(single({ payload: { ...base, key: [] } }))).toBe(false);
    expect(ok(single({ payload: { ...base, key: ['o1', 'o2'] } }))).toBe(false);
    expect(ok(single({ payload: { ...base, key: ['o9'] } }))).toBe(false);
  });

  it('từ chối id Phương án trùng và Phương án rỗng', () => {
    const dup = { options: [opt('o1'), opt('o1')], key: ['o1'], shuffleOptions: true };
    expect(ok(single({ payload: dup }))).toBe(false);
    const empty = {
      options: [
        opt('o1'),
        { id: 'o2', content: { type: 'doc', content: [{ type: 'paragraph' }] } },
      ],
      key: ['o1'],
      shuffleOptions: true,
    };
    expect(ok(single({ payload: empty }))).toBe(false);
  });
});

describe('Câu chọn nhiều', () => {
  it('hợp lệ với một hoặc nhiều đáp án và hai quy tắc chấm', () => {
    expect(ok(multiple())).toBe(true);
    expect(ok(multiple({ key: ['o1'] }))).toBe(true);
    expect(ok(multiple({ scoringRule: 'all_or_nothing' }))).toBe(true);
  });

  it('từ chối không có đáp án, quy tắc Bậc thang hoặc thiếu quy tắc', () => {
    expect(ok(multiple({ key: [] }))).toBe(false);
    expect(ok(multiple({ scoringRule: 'ladder' }))).toBe(false);
    expect(ok(multiple({ scoringRule: undefined }))).toBe(false);
  });
});

describe('Chùm đúng/sai', () => {
  it('hợp lệ với 1–8 Mệnh đề', () => {
    expect(ok(cluster())).toBe(true);
    expect(ok(cluster({ statements: [stmt('s1', true)] }))).toBe(true);
    const eight = Array.from({ length: 8 }, (_, i) => stmt(`s${i + 1}`, i % 2 === 0));
    expect(ok(cluster({ statements: eight }))).toBe(true);
  });

  it('từ chối 0 hoặc 9 Mệnh đề', () => {
    expect(ok(cluster({ statements: [] }))).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => stmt(`s${i + 1}`, true));
    expect(ok(cluster({ statements: nine }))).toBe(false);
  });

  it('Bậc thang: dài số Mệnh đề + 1, từ 0 đến 1, không giảm dần', () => {
    const ladder = (values: number[]) => cluster({ scoringRule: 'ladder', ladder: values });
    expect(ok(ladder([0, 0.1, 0.25, 0.5, 1]))).toBe(true);
    expect(ok(ladder([0, 0, 0.5, 0.5, 1]))).toBe(true);
    expect(ok(ladder([0, 0.5, 1]))).toBe(false); // sai độ dài (4 Mệnh đề cần 5 phần tử)
    expect(ok(ladder([0.1, 0.2, 0.3, 0.5, 1]))).toBe(false); // không bắt đầu từ 0
    expect(ok(ladder([0, 0.1, 0.25, 0.5, 0.9]))).toBe(false); // không kết thúc ở 1
    expect(ok(ladder([0, 0.5, 0.25, 0.75, 1]))).toBe(false); // giảm
    expect(ok(ladder([0, 0.1, 0.25, 0.5, 1.5]))).toBe(false); // ngoài [0, 1]
    expect(ok(cluster({ scoringRule: 'ladder' }))).toBe(false); // thiếu ladder
  });

  it('chỉ Bậc thang mới được mang ladder', () => {
    expect(ok(cluster({ ladder: [0, 0.1, 0.25, 0.5, 1] }))).toBe(false);
  });
});

describe('Câu tự luận', () => {
  it('hợp lệ với maxLength 100–5.000, rubric tùy chọn', () => {
    expect(ok(essay())).toBe(true);
    expect(ok(essay({ maxLength: 100 }))).toBe(true);
    expect(ok(essay({ maxLength: 5000 }))).toBe(true);
    expect(ok(essay({ rubric: textDoc('Nêu đủ 3 ý') }))).toBe(true);
  });

  it('từ chối maxLength ngoài khoảng hoặc không nguyên', () => {
    expect(ok(essay({ maxLength: 99 }))).toBe(false);
    expect(ok(essay({ maxLength: 5001 }))).toBe(false);
    expect(ok(essay({ maxLength: 200.5 }))).toBe(false);
  });
});

describe('phần chung', () => {
  it('điểm mặc định từ 0,05 đến 100, bước 0,05', () => {
    for (const points of [0.05, 0.1, 0.15, 0.25, 0.3, 0.75, 1.1, 2.5, 33.35, 99.95, 100]) {
      expect(ok(single({ defaultPoints: points }))).toBe(true);
    }
    for (const points of [0, 0.01, 0.07, 0.12, 1.123, 100.05]) {
      expect(ok(single({ defaultPoints: points }))).toBe(false);
    }
  });

  it('tags: tối đa 10, 1–30 ký tự, chuẩn hóa chữ thường và khoảng trắng, bỏ trùng', () => {
    const parsed = questionInputSchema.parse(
      single({ tags: ['  Chương   2 ', 'GIỚI HẠN', 'chương 2'] }),
    );
    expect(parsed.tags).toEqual(['chương 2', 'giới hạn']);
    expect(ok(single({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }))).toBe(false);
    expect(ok(single({ tags: ['x'.repeat(31)] }))).toBe(false);
    expect(ok(single({ tags: [''] }))).toBe(false);
  });

  it('Phần dẫn tối đa 20.000 ký tự, Phương án tối đa 2.000', () => {
    expect(ok(single({ stem: textDoc('a'.repeat(20000)) }))).toBe(true);
    expect(ok(single({ stem: textDoc('a'.repeat(20001)) }))).toBe(false);
    const long = {
      options: [opt('o1', 'a'.repeat(2001)), opt('o2')],
      key: ['o1'],
      shuffleOptions: true,
    };
    expect(ok(single({ payload: long }))).toBe(false);
  });

  it('từ chối trường lạ và loại không biết', () => {
    expect(ok(single({ owner: 'x' }))).toBe(false);
    expect(ok(single({ type: 'matching' }))).toBe(false);
  });
});

describe('searchTextOf', () => {
  it('gộp Phần dẫn, Phương án, Mệnh đề đã chuẩn hóa; không gồm rubric', () => {
    const input = questionInputSchema.parse(single());
    expect(searchTextOf(input)).toBe(
      'dao ham cua x² la gi? phuong an o1 phuong an o2 phuong an o3',
    );
    const e = questionInputSchema.parse(essay({ rubric: textDoc('Bí mật chấm') }));
    expect(searchTextOf(e)).not.toContain('bi mat');
    const c = questionInputSchema.parse(cluster());
    expect(searchTextOf(c)).toContain('menh de s3');
  });
});

describe('công thức trong Câu hỏi', () => {
  const withMath = (latex: string, count = 1) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: Array.from({ length: count }, () => ({
          type: 'math',
          attrs: { latex, display: false },
        })),
      },
    ],
  });

  it('Phần dẫn chỉ có công thức vẫn tính là có nội dung', () => {
    expect(questionInputSchema.safeParse(single({ stem: withMath('x^2') })).success).toBe(true);
  });

  it(`nhận đúng ${MATH_MAX_PER_QUESTION} công thức, từ chối nhiều hơn (tính cả Phương án)`, () => {
    const stem = withMath('x', MATH_MAX_PER_QUESTION - 1);
    const okInput = single({
      stem,
      payload: {
        options: [{ id: 'o1', content: withMath('y') }, opt('o2')],
        key: ['o1'],
        shuffleOptions: false,
      },
    });
    expect(questionInputSchema.safeParse(okInput).success).toBe(true);
    const tooMany = single({
      stem,
      payload: {
        options: [{ id: 'o1', content: withMath('y', 2) }, opt('o2')],
        key: ['o1'],
        shuffleOptions: false,
      },
    });
    expect(questionInputSchema.safeParse(tooMany).success).toBe(false);
  });

  it('tính cả công thức trong hướng dẫn chấm của câu tự luận', () => {
    const essay = (rubricMath: number) => ({
      ...single(),
      type: 'essay',
      stem: withMath('x', MATH_MAX_PER_QUESTION),
      payload: { maxLength: 500, rubric: withMath('y', rubricMath) },
    });
    expect(questionInputSchema.safeParse(essay(0)).success).toBe(true);
    expect(questionInputSchema.safeParse(essay(1)).success).toBe(false);
  });

  it('searchText chứa LaTeX đã chuẩn hóa của công thức trong Phần dẫn', () => {
    const input = questionInputSchema.parse(single({ stem: withMath('\\Frac{1}{2}') }));
    expect(searchTextOf(input)).toContain('\\frac{1}{2}');
  });

  it(`từ chối khi tổng ký tự LaTeX của Câu hỏi vượt ${MATH_MAX_TOTAL_CHARS}`, () => {
    const long = 'x+'.repeat(900); // 1.800 ký tự mỗi công thức
    const stems = (count: number) => withMath(long, count);
    const fits = Math.floor(MATH_MAX_TOTAL_CHARS / long.length);
    expect(questionInputSchema.safeParse(single({ stem: stems(fits) })).success).toBe(true);
    expect(questionInputSchema.safeParse(single({ stem: stems(fits + 1) })).success).toBe(false);
  });
});

describe('hình minh họa trong Câu hỏi', () => {
  const ID = '0b9f2c5e-3f43-4c8e-9a35-5f4f3b0d1a11';
  const withImages = (count: number) => ({
    type: 'doc',
    content: Array.from({ length: count }, () => ({
      type: 'image',
      attrs: { illustrationId: ID, alt: 'Hình' },
    })),
  });

  it(`nhận đúng ${IMAGE_MAX_PER_QUESTION} ảnh, từ chối nhiều hơn (tính cả Phương án)`, () => {
    const withOption = (optionImages: number) =>
      single({
        stem: withImages(IMAGE_MAX_PER_QUESTION - 1),
        payload: {
          options: [{ id: 'o1', content: withImages(optionImages) }, opt('o2')],
          key: ['o1'],
          shuffleOptions: false,
        },
      });
    expect(questionInputSchema.safeParse(withOption(1)).success).toBe(true);
    expect(questionInputSchema.safeParse(withOption(2)).success).toBe(false);
  });

  it('Phần dẫn chỉ có ảnh vẫn tính là có nội dung, và alt nằm trong searchText', () => {
    const input = questionInputSchema.parse(single({ stem: withImages(1) }));
    expect(searchTextOf(input)).toContain('hinh');
  });
});

describe('đếm ký tự theo chữ Việt dựng sẵn (NFC)', () => {
  // 1.000 chữ "ệ": ở dạng dấu rời mỗi chữ là 3 ký tự nên đếm thô sẽ là 3.000, vượt giới hạn 2.000 của Phương án.
  const longNfd = 'ệ'.repeat(1000).normalize('NFD');
  const longNfc = 'ệ'.repeat(1000);

  it('Phương án dài 1.000 chữ có dấu được nhận dù nhập ở dạng dấu rời, và lưu giống hệt dạng dựng sẵn', () => {
    const withText = (value: string) =>
      single({
        payload: {
          options: [opt('o1', value), opt('o2'), opt('o3')],
          key: ['o2'],
          shuffleOptions: true,
        },
      });
    expect(longNfd.length).toBe(3000);
    expect(ok(withText(longNfd))).toBe(true);
    const a = questionInputSchema.parse(withText(longNfd));
    const b = questionInputSchema.parse(withText(longNfc));
    expect(a).toEqual(b);
  });

  it('vẫn từ chối nội dung thật sự quá dài (đếm theo dạng dựng sẵn)', () => {
    const tooLong = 'ệ'.repeat(2001).normalize('NFD');
    const withText = single({
      payload: {
        options: [opt('o1', tooLong), opt('o2'), opt('o3')],
        key: ['o2'],
        shuffleOptions: true,
      },
    });
    expect(ok(withText)).toBe(false);
  });
});
