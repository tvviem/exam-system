import { describe, expect, it } from 'vitest';
import type { ContentItem, ExamContentData } from '../../common/exam-content';
import { toPaperSpec } from './paper-spec';

const rt = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const item = (
  type: ContentItem['snapshot']['type'],
  payload: Record<string, unknown>,
  sectionId = 's1',
): ContentItem => ({
  itemId: `i-${Math.random()}`,
  sectionId,
  points: 1,
  snapshot: { questionId: 'q', type, stem: rt('Nội dung'), payload, illustrations: [] },
});

const single = () =>
  item('single_choice', {
    options: [
      { id: 'o1', content: rt('Một') },
      { id: 'o2', content: rt('Hai') },
    ],
    key: ['o2'],
    shuffleOptions: true,
  });
const essay = () => item('essay', { maxLength: 500, rubric: rt('Hướng dẫn chấm bí mật') });

const content = (...items: ContentItem[]): ExamContentData => ({
  examId: 'e1',
  title: 'Giữa kỳ Giải tích',
  instructions: rt(''),
  sections: [{ id: 's1', title: null, instructions: rt(''), drawPercent: 100, items }],
});

const request = { course: 'Giải tích 1' };

describe('toPaperSpec: từ nội dung Bộ đề đã Phát hành sang dữ liệu dựng tệp', () => {
  it('khung thông tin từ Phiên thi: Học phần nhập, ngày giờ Việt Nam, thời gian, Hình thức suy từ các Loại, Đơn vị của Người ra đề', () => {
    const spec = toPaperSpec({
      content: content(single()),
      session: {
        opensAt: new Date('2026-05-27T01:30:00Z'), // 08:30 giờ Việt Nam
        closesAt: new Date('2026-05-27T04:30:00Z'),
        durationMinutes: 60,
      },
      unitName: 'Khoa Kỹ thuật và Công nghệ',
      request,
    });

    expect(spec.school).toBe('Trường Đại học Bạc Liêu');
    expect(spec.unit).toBe('Khoa Kỹ thuật và Công nghệ');
    expect(spec.examCode).toBe('đề chuẩn');
    expect(spec.heading).toEqual({
      title: 'THI KẾT THÚC HỌC PHẦN',
      examName: 'Giữa kỳ Giải tích',
      course: 'Giải tích 1',
      date: '27/05/2026',
      form: 'Trắc nghiệm',
      duration: '60 phút',
    });
  });

  it('Hình thức thi suy từ các Loại câu: chỉ trắc nghiệm, cả hai, chỉ tự luận', () => {
    const formOf = (...items: ContentItem[]) =>
      toPaperSpec({ content: content(...items), session: null, unitName: null, request }).heading
        .form;
    expect(formOf(single(), item('true_false_cluster', { statements: [] }))).toBe('Trắc nghiệm');
    expect(formOf(single(), essay())).toBe('Trắc nghiệm và tự luận');
    expect(formOf(essay())).toBe('Tự luận');
  });

  it('Khung giờ nhiều ngày ghi khoảng ngày theo giờ Việt Nam; xuất từ Bộ đề thì bỏ trống ngày và thời gian; Đơn vị thiếu thì rỗng', () => {
    const spec = toPaperSpec({
      content: content(single()),
      session: {
        opensAt: new Date('2026-05-27T17:30:00Z'), // 00:30 ngày 28 giờ Việt Nam
        closesAt: new Date('2026-05-29T10:00:00Z'),
        durationMinutes: 90,
      },
      unitName: null,
      request,
    });
    expect(spec.heading.date).toBe('28/05/2026 - 29/05/2026');
    expect(spec.unit).toBe('');

    const fromExam = toPaperSpec({
      content: content(single()),
      session: null,
      unitName: null,
      request,
    });
    expect(fromExam.heading.date).toBe('');
    expect(fromExam.heading.duration).toBe('');
  });

  it('gỡ đáp án và hướng dẫn chấm: payload chỉ còn nội dung hiển thị, không còn key, rubric, thang điểm', () => {
    const cluster = item('true_false_cluster', {
      statements: [
        { id: 's1', content: rt('Mệnh đề A'), key: true },
        { id: 's2', content: rt('Mệnh đề B'), key: false },
      ],
      scoringRule: 'ladder',
      ladder: [0, 0.25, 1],
    });
    const spec = toPaperSpec({
      content: content(single(), cluster, essay()),
      session: null,
      unitName: null,
      request,
    });
    const items = spec.sections[0]?.items ?? [];

    expect(items[0]?.payload).toEqual({
      options: [{ content: rt('Một') }, { content: rt('Hai') }],
    });
    expect(items[1]?.payload).toEqual({
      statements: [{ content: rt('Mệnh đề A') }, { content: rt('Mệnh đề B') }],
    });
    expect(items[2]?.payload).toEqual({});
    const dump = JSON.stringify(spec);
    for (const secret of [
      '"key"',
      'rubric',
      'Hướng dẫn chấm bí mật',
      'ladder',
      'scoringRule',
      'o2',
    ]) {
      expect(dump).not.toContain(secret);
    }
  });

  it('Phần không tiêu đề hoặc không hướng dẫn thì không in thêm gì', () => {
    const spec = toPaperSpec({
      content: {
        examId: 'e1',
        title: 'Đề',
        instructions: rt(''),
        sections: [
          { id: 's1', title: '   ', instructions: rt(''), drawPercent: 100, items: [single()] },
          {
            id: 's2',
            title: 'PHẦN II',
            instructions: rt('Làm hết.'),
            drawPercent: 100,
            items: [essay()],
          },
        ],
      },
      session: null,
      unitName: null,
      request,
    });
    expect(spec.sections[0]?.title).toBeNull();
    expect(spec.sections[0]?.instructions).toBeUndefined();
    expect(spec.sections[1]?.title).toBe('PHẦN II');
    expect(spec.sections[1]?.instructions).toEqual(rt('Làm hết.'));
  });

  it('hướng dẫn chung của Bộ đề đi vào dữ liệu dựng tệp; hướng dẫn trống thì bỏ', () => {
    const withGuide = toPaperSpec({
      content: { ...content(single()), instructions: rt('Làm bài cẩn thận') },
      session: null,
      unitName: null,
      request,
    });
    expect(withGuide.instructions).toEqual(rt('Làm bài cẩn thận'));

    const blank = toPaperSpec({
      content: { ...content(single()), instructions: rt('   ') },
      session: null,
      unitName: null,
      request,
    });
    expect(blank.instructions).toBeUndefined();
  });
});
