import { PAPER_PRESET_BLOCKS, paperExportRequestSchema } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import {
  emptyPaperForm,
  filenameOfDisposition,
  loadPaperPrefs,
  type PaperForm,
  paperRequestOf,
  parsePaperWarnings,
  savePaperPrefs,
  selectPreset,
} from './paper-export';

const SESSION = '00000000-0000-4000-8000-000000000002';
const EXAM = '00000000-0000-4000-8000-000000000001';

const form = (over: Partial<PaperForm> = {}): PaperForm => ({ ...emptyPaperForm(), ...over });

describe('paperRequestOf: yêu cầu gửi api từ biểu mẫu', () => {
  it('cắt khoảng trắng, bỏ ô tùy chọn để trống, luôn gửi Mẫu; chỉ gửi công tắc khác mặc định của Mẫu', () => {
    expect(paperRequestOf({ sessionId: SESSION }, form({ course: '  Giải tích 1  ' }))).toEqual({
      sessionId: SESSION,
      course: 'Giải tích 1',
      preset: 'school',
    });

    expect(
      paperRequestOf(
        { examId: EXAM },
        form({
          course: 'Toán',
          title: ' THI GIỮA KỲ ',
          examCode: ' 132 ',
          unit: ' Khoa Kỹ thuật và Công nghệ ',
          blocks: { ...PAPER_PRESET_BLOCKS.school, nationalHeader: true },
        }),
      ),
    ).toEqual({
      examId: EXAM,
      course: 'Toán',
      title: 'THI GIỮA KỲ',
      examCode: '132',
      unit: 'Khoa Kỹ thuật và Công nghệ',
      preset: 'school',
      blocks: { nationalHeader: true },
    });
  });

  it('công tắc so với Mẫu đang chọn: Gọn bật lại lưới thì gửi grid: true, tắt hết như Gọn thì không gửi blocks', () => {
    const compact = form({ course: 'X', preset: 'compact', blocks: PAPER_PRESET_BLOCKS.compact });
    expect(paperRequestOf({ examId: EXAM }, compact).blocks).toBeUndefined();
    const withGrid = { ...compact, blocks: { ...PAPER_PRESET_BLOCKS.compact, grid: true } };
    expect(paperRequestOf({ examId: EXAM }, withGrid).blocks).toEqual({ grid: true });
  });

  it('kết quả luôn qua được lược đồ của máy chủ (hợp đồng chung)', () => {
    const cases = [
      form({ course: 'Giải tích 1' }),
      form({
        course: 'Toán',
        preset: 'compact',
        blocks: { nationalHeader: true, candidateFields: false, grid: true },
      }),
      form({ course: 'Hóa', title: 'T', examCode: '1', unit: 'U' }),
    ];
    for (const value of cases) {
      expect(() =>
        paperExportRequestSchema.parse(paperRequestOf({ sessionId: SESSION }, value)),
      ).not.toThrow();
    }
  });
});

describe('selectPreset: đổi Mẫu đặt lại ba công tắc theo Mẫu mới, giữ các ô khác', () => {
  it('Mẫu Trường sang Gọn tắt ô thí sinh và lưới; về lại thì bật lại', () => {
    const start = form({ course: 'Toán', title: 'T', examCode: '9' });
    const compact = selectPreset(start, 'compact');
    expect(compact.preset).toBe('compact');
    expect(compact.blocks).toEqual(PAPER_PRESET_BLOCKS.compact);
    expect([compact.course, compact.title, compact.examCode]).toEqual(['Toán', 'T', '9']);
    expect(selectPreset(compact, 'school').blocks).toEqual(PAPER_PRESET_BLOCKS.school);
  });
});

describe('parsePaperWarnings: header X-Paper-Warnings (JSON mã hóa URL)', () => {
  it('đọc danh sách cảnh báo tiếng Việt có dấu', () => {
    const header = encodeURIComponent(
      JSON.stringify(['Câu 7: công thức chưa hỗ trợ xuất, đã in mã LaTeX', 'và 2 cảnh báo khác']),
    );
    expect(parsePaperWarnings(header)).toEqual([
      'Câu 7: công thức chưa hỗ trợ xuất, đã in mã LaTeX',
      'và 2 cảnh báo khác',
    ]);
  });

  it.each([
    ['không có header', null],
    ['rỗng', ''],
    ['không phải JSON', '%E0%A4%A'],
    ['JSON không phải mảng', encodeURIComponent('{"a":1}')],
    ['mảng chứa phần tử không phải chuỗi', encodeURIComponent('["a",1]')],
  ])('trả danh sách rỗng khi %s (tệp vẫn tải được, chỉ không hiện cảnh báo)', (_name, header) => {
    expect(parsePaperWarnings(header)).toEqual([]);
  });
});

describe('filenameOfDisposition: tên tệp từ Content-Disposition', () => {
  it('lấy tên trong dấu nháy; không có thì null', () => {
    expect(filenameOfDisposition('attachment; filename="de-thi-giua-ky.docx"')).toBe(
      'de-thi-giua-ky.docx',
    );
    expect(filenameOfDisposition('attachment')).toBeNull();
    expect(filenameOfDisposition(null)).toBeNull();
  });
});

/** Kho giả có thể ném lỗi như localStorage bị chặn (cửa sổ riêng tư, tắt dữ liệu trang). */
const memory = (opts: { throws?: boolean } = {}) => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if (opts.throws) throw new Error('bị chặn');
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (opts.throws) throw new Error('bị chặn');
      data.set(key, value);
    },
    data,
  };
};

describe('ghi nhớ lần nhập gần nhất (localStorage)', () => {
  it('nhớ Học phần, Tiêu đề kỳ thi, Mẫu và công tắc; không nhớ Mã đề và Đơn vị', () => {
    const storage = memory();
    savePaperPrefs(
      form({
        course: 'Giải tích 1',
        title: 'THI GIỮA KỲ',
        examCode: '132',
        unit: 'Khoa X',
        preset: 'compact',
        blocks: { nationalHeader: true, candidateFields: false, grid: false },
      }),
      storage,
    );

    expect(loadPaperPrefs(storage)).toEqual({
      course: 'Giải tích 1',
      title: 'THI GIỮA KỲ',
      preset: 'compact',
      blocks: { nationalHeader: true, candidateFields: false, grid: false },
    });
    expect(JSON.stringify([...storage.data.values()])).not.toContain('132');
    expect(JSON.stringify([...storage.data.values()])).not.toContain('Khoa X');
  });

  it('chưa có, hỏng hay bị chặn thì dùng mặc định (Mẫu Trường); ghi vào kho bị chặn không ném lỗi', () => {
    const defaults = {
      course: '',
      title: '',
      preset: 'school',
      blocks: PAPER_PRESET_BLOCKS.school,
    };
    expect(loadPaperPrefs(memory())).toEqual(defaults);

    const corrupt = memory();
    corrupt.setItem('exam:paper-export', '{không phải json');
    expect(loadPaperPrefs(corrupt)).toEqual(defaults);

    const wrongShape = memory();
    wrongShape.setItem(
      'exam:paper-export',
      JSON.stringify({
        course: 5,
        title: null,
        preset: 'khac',
        blocks: { grid: 'có', nationalHeader: true },
      }),
    );
    expect(loadPaperPrefs(wrongShape)).toEqual({
      ...defaults,
      blocks: { ...PAPER_PRESET_BLOCKS.school, nationalHeader: true },
    });

    const blocked = memory({ throws: true });
    expect(loadPaperPrefs(blocked)).toEqual(defaults);
    expect(() => savePaperPrefs(form({ course: 'X' }), blocked)).not.toThrow();
  });
});
