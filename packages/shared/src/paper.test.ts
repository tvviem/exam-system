import { describe, expect, it } from 'vitest';
import { PAPER_PRESET_BLOCKS, paperExportRequestSchema, resolvePaperBlocks } from './paper.js';

const EXAM = '00000000-0000-4000-8000-000000000001';
const SESSION = '00000000-0000-4000-8000-000000000002';

describe('khối của từng Mẫu (docs/plan/xuat-bo-de-thiet-ke.md mục 3.5)', () => {
  it('Mẫu Trường như đề giấy: có ô thí sinh và lưới, không có Quốc hiệu; Gọn bỏ ô thí sinh và lưới', () => {
    expect(PAPER_PRESET_BLOCKS.school).toEqual({
      nationalHeader: false,
      candidateFields: true,
      grid: true,
    });
    expect(PAPER_PRESET_BLOCKS.compact).toEqual({
      nationalHeader: false,
      candidateFields: false,
      grid: false,
    });
  });

  it('công tắc riêng đè lên bộ cài sẵn; không đè thì giữ nguyên bộ cài sẵn (mặc định Mẫu Trường)', () => {
    expect(resolvePaperBlocks()).toEqual(PAPER_PRESET_BLOCKS.school);
    expect(resolvePaperBlocks('compact', { grid: true })).toEqual({
      nationalHeader: false,
      candidateFields: false,
      grid: true,
    });
  });
});

describe('paperExportRequestSchema: yêu cầu xuất Đề thi', () => {
  it('nhận Bộ đề hoặc Phiên thi (đúng một) kèm Học phần; cắt khoảng trắng', () => {
    expect(paperExportRequestSchema.parse({ examId: EXAM, course: '  Giải tích 1 ' })).toEqual({
      examId: EXAM,
      course: 'Giải tích 1',
    });
    expect(paperExportRequestSchema.parse({ sessionId: SESSION, course: 'X' }).sessionId).toBe(
      SESSION,
    );
  });

  it.each([
    ['thiếu Học phần', { examId: EXAM }],
    ['Học phần toàn khoảng trắng', { examId: EXAM, course: '   ' }],
    ['Học phần quá dài', { examId: EXAM, course: 'x'.repeat(151) }],
    ['không có nguồn', { course: 'X' }],
    ['cả hai nguồn', { examId: EXAM, sessionId: SESSION, course: 'X' }],
    ['Mẫu không có', { examId: EXAM, course: 'X', preset: 'khac' }],
    ['trường lạ', { examId: EXAM, course: 'X', thua: 1 }],
    ['mã không phải uuid', { examId: 'abc', course: 'X' }],
  ])('từ chối: %s', (_name, body) => {
    expect(paperExportRequestSchema.safeParse(body).success).toBe(false);
  });

  it('nhận các tùy chọn: tiêu đề, mã đề, Đơn vị, Mẫu và công tắc từng khối', () => {
    const parsed = paperExportRequestSchema.parse({
      sessionId: SESSION,
      course: 'Toán',
      title: 'THI GIỮA KỲ',
      examCode: '132',
      unit: 'Khoa Kỹ thuật và Công nghệ',
      preset: 'compact',
      blocks: { nationalHeader: true },
    });
    expect(parsed.preset).toBe('compact');
    expect(parsed.blocks).toEqual({ nationalHeader: true });
  });
});
