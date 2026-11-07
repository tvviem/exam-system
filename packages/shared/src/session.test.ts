import { describe, expect, it } from 'vitest';
import {
  ACCESS_CODE_ALPHABET,
  countSessionActivities,
  generateAccessCode,
  normalizeAccessCode,
  parseCodeList,
  phaseOf,
  sessionActivityOf,
  sessionChangeProblems,
  sessionEditableFields,
  sessionSettingsSchema,
  sessionUpdateSchema,
} from './session.js';

const at = (iso: string) => new Date(iso);
const base = {
  opensAt: at('2026-12-01T01:00:00Z'),
  closesAt: at('2026-12-01T03:00:00Z'),
  entryClosedAt: null,
  cancelledAt: null,
};

describe('phaseOf: trạng thái hiện cho Người ra đề (Q202)', () => {
  it('trước giờ mở là Sắp mở', () => {
    expect(phaseOf(base, at('2026-12-01T00:59:59.999Z'))).toBe('upcoming');
  });

  it('đúng giờ mở là Đang mở', () => {
    expect(phaseOf(base, at('2026-12-01T01:00:00Z'))).toBe('open');
  });

  it('đúng giờ đóng vẫn Đang mở (giờ đóng là giờ cuối cùng được bắt đầu), quá một mili giây là Đã đóng', () => {
    expect(phaseOf(base, at('2026-12-01T03:00:00Z'))).toBe('open');
    expect(phaseOf(base, at('2026-12-01T03:00:00.001Z'))).toBe('closed');
  });

  it('đã Đóng cửa vào thi trong lúc mở thì hiện Đóng cửa vào thi, qua giờ đóng thì Đã đóng', () => {
    const closedEntry = { ...base, entryClosedAt: at('2026-12-01T01:30:00Z') };
    expect(phaseOf(closedEntry, at('2026-12-01T02:00:00Z'))).toBe('entry_closed');
    expect(phaseOf(closedEntry, at('2026-12-01T04:00:00Z'))).toBe('closed');
  });

  it('Đã hủy thắng mọi trạng thái khác', () => {
    const cancelled = { ...base, cancelledAt: at('2026-11-30T00:00:00Z') };
    expect(phaseOf(cancelled, at('2026-11-30T12:00:00Z'))).toBe('cancelled');
    expect(phaseOf(cancelled, at('2026-12-01T02:00:00Z'))).toBe('cancelled');
    expect(phaseOf(cancelled, at('2026-12-02T00:00:00Z'))).toBe('cancelled');
  });
});

describe('Mã vào thi (Q201)', () => {
  it('chuẩn hóa: bỏ khoảng trắng và gạch nối, viết hoa', () => {
    expect(normalizeAccessCode('  ab3-k 9x ')).toBe('AB3K9X');
  });

  it('bảng ký tự bỏ 0, O, 1, I, L', () => {
    for (const bad of '01OIL') expect(ACCESS_CODE_ALPHABET).not.toContain(bad);
    expect(ACCESS_CODE_ALPHABET).toHaveLength(31);
  });

  it('sinh mã 6 ký tự từ bộ sinh số cho trước', () => {
    const sequence = [0, 1, 2, 3, 4, 5];
    expect(generateAccessCode(() => sequence.shift() ?? 0)).toBe('ABCDEF');
  });

  it('chỉ lấy chỉ số trong bảng ký tự', () => {
    const asked: number[] = [];
    generateAccessCode((max) => {
      asked.push(max);
      return 0;
    });
    expect(asked).toEqual([31, 31, 31, 31, 31, 31]);
  });
});

describe('parseCodeList: dán nhiều Mã định danh (Q3 của 4a)', () => {
  it('tách theo dòng, dấu phẩy, chấm phẩy, khoảng trắng; bỏ trùng không phân biệt hoa thường; giữ thứ tự', () => {
    expect(parseCodeList('SV001\nsv002, SV003;\tSV001  \r\n\n')).toEqual([
      'SV001',
      'sv002',
      'SV003',
    ]);
  });

  it('rỗng thì ra danh sách rỗng', () => {
    expect(parseCodeList(' \n ')).toEqual([]);
  });
});

const EXAM = '0197a6f0-0000-7000-8000-000000000001';
const settings = (over: Record<string, unknown> = {}) => ({
  examId: EXAM,
  title: 'Giữa kỳ Giải tích - ca 1',
  opensAt: '2026-12-01T01:00:00Z',
  closesAt: '2026-12-01T03:00:00Z',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...over,
});
const parse = (value: unknown) => sessionSettingsSchema.safeParse(value);

describe('thiết lập Phiên thi (Q199–Q202, Q208)', () => {
  it('nhận thiết lập hợp lệ và điền mặc định', () => {
    const result = parse(settings());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      examId: EXAM,
      title: 'Giữa kỳ Giải tích - ca 1',
      opensAt: new Date('2026-12-01T01:00:00Z'),
      closesAt: new Date('2026-12-01T03:00:00Z'),
      durationMinutes: 45,
      hardClose: false,
      maxAttempts: 1,
      attemptScoring: 'highest',
      shuffleItems: false,
      shuffleOptions: false,
      showScoringRules: false,
      reviewAfterRelease: false,
      accessCode: 'AB3K9X',
    });
  });

  it('gọn khoảng trắng của tên và chuẩn hóa Mã vào thi', () => {
    const result = parse(settings({ title: '  Ca   1 ', accessCode: ' ab3-k9x ' }));
    expect(result.data?.title).toBe('Ca 1');
    expect(result.data?.accessCode).toBe('AB3K9X');
  });

  it('không có Mã vào thi thì để server gợi ý', () => {
    const { accessCode: _omit, ...rest } = settings();
    const result = parse(rest);
    expect(result.success).toBe(true);
    expect(result.data?.accessCode).toBeUndefined();
  });

  it.each([
    ['tên rỗng', { title: '   ' }],
    ['giờ đóng không sau giờ mở', { closesAt: '2026-12-01T01:00:00Z' }],
    ['giờ không có múi giờ', { opensAt: '2026-12-01T08:00:00' }],
    ['Thời lượng 0', { durationMinutes: 0 }],
    ['Thời lượng 601', { durationMinutes: 601 }],
    ['Thời lượng lẻ', { durationMinutes: 45.5 }],
    ['0 lượt làm', { maxAttempts: 0 }],
    ['6 lượt làm', { maxAttempts: 6 }],
    ['cách tính điểm lạ', { attemptScoring: 'average' }],
    ['mã 3 ký tự', { accessCode: 'AB3' }],
    ['mã 13 ký tự', { accessCode: 'ABCDEFGHJKMNP' }],
    ['mã có ký tự đặc biệt', { accessCode: 'AB3K9!' }],
    ['khóa lạ', { owner: 'x' }],
  ])('từ chối %s', (_name, over) => {
    expect(parse(settings(over)).success).toBe(false);
  });

  it('chỉ ra đúng trường sai', () => {
    const result = parse(settings({ closesAt: '2026-12-01T01:00:00Z' }));
    expect(result.error?.issues[0]?.path).toEqual(['closesAt']);
  });
});

describe('sessionChangeProblems: sửa theo trạng thái (Q202)', () => {
  const before = parse(settings()).data as NonNullable<ReturnType<typeof parse>['data']>;
  const change = (over: object) => ({ ...before, ...over });
  const codes = (phase: Parameters<typeof sessionChangeProblems>[0], over: object) =>
    sessionChangeProblems(phase, before, change(over));

  it('Sắp mở: sửa được mọi thứ', () => {
    expect(
      codes('upcoming', {
        examId: '0197a6f0-0000-7000-8000-000000000002',
        title: 'Khác',
        opensAt: new Date('2026-12-01T00:00:00Z'),
        closesAt: new Date('2026-12-01T02:00:00Z'),
        durationMinutes: 10,
        hardClose: true,
        maxAttempts: 3,
        attemptScoring: 'latest',
        shuffleItems: true,
        shuffleOptions: true,
        showScoringRules: true,
        accessCode: 'ZZZZZZ',
      }),
    ).toEqual([]);
  });

  it('Đang mở: kéo dài Khung giờ, kéo dài Thời lượng và đổi mã được', () => {
    expect(
      codes('open', {
        closesAt: new Date('2026-12-01T04:00:00Z'),
        durationMinutes: 60,
        accessCode: 'ZZZZZZ',
      }),
    ).toEqual([]);
  });

  it('Đang mở: không rút ngắn Khung giờ hay Thời lượng', () => {
    expect(codes('open', { closesAt: new Date('2026-12-01T02:00:00Z') })).toEqual([
      { path: 'closesAt', code: 'cannot_shorten' },
    ]);
    expect(codes('open', { durationMinutes: 30 })).toEqual([
      { path: 'durationMinutes', code: 'cannot_shorten' },
    ]);
  });

  it.each([
    'examId',
    'title',
    'opensAt',
    'hardClose',
    'maxAttempts',
    'attemptScoring',
    'shuffleItems',
    'shuffleOptions',
    'showScoringRules',
  ] as const)('Đang mở và Đóng cửa vào thi: khóa %s', (field) => {
    const value: Record<typeof field, unknown> = {
      examId: '0197a6f0-0000-7000-8000-000000000002',
      title: 'Khác',
      opensAt: new Date('2026-12-01T00:30:00Z'),
      hardClose: true,
      maxAttempts: 2,
      attemptScoring: 'latest',
      shuffleItems: true,
      shuffleOptions: true,
      showScoringRules: true,
    };
    for (const phase of ['open', 'entry_closed'] as const) {
      expect(codes(phase, { [field]: value[field] })).toEqual([{ path: field, code: 'locked' }]);
    }
  });

  it.each(['closed', 'cancelled'] as const)('%s: không sửa gì, kể cả mã', (phase) => {
    expect(codes(phase, { accessCode: 'ZZZZZZ' })).toEqual([
      { path: 'accessCode', code: 'locked' },
    ]);
    expect(codes(phase, { closesAt: new Date('2026-12-01T05:00:00Z') })).toEqual([
      { path: 'closesAt', code: 'locked' },
    ]);
  });

  it('không đổi gì thì không có vấn đề ở mọi trạng thái', () => {
    for (const phase of ['upcoming', 'open', 'entry_closed', 'closed', 'cancelled'] as const) {
      expect(sessionChangeProblems(phase, before, { ...before })).toEqual([]);
    }
  });
});

describe('sessionUpdateSchema: sửa kèm version', () => {
  it('bắt buộc có version nguyên dương', () => {
    expect(sessionUpdateSchema.safeParse(settings()).success).toBe(false);
    expect(sessionUpdateSchema.safeParse(settings({ version: 0 })).success).toBe(false);
    expect(sessionUpdateSchema.safeParse(settings({ version: 3 })).data?.version).toBe(3);
  });

  it('vẫn kiểm giờ đóng sau giờ mở', () => {
    const result = sessionUpdateSchema.safeParse(
      settings({ version: 1, closesAt: '2026-12-01T01:00:00Z' }),
    );
    expect(result.error?.issues[0]?.path).toEqual(['closesAt']);
  });
});

describe('sessionEditableFields: giao diện khóa ô nào (Q202)', () => {
  it('Sắp mở: mọi ô sửa tự do', () => {
    const fields = sessionEditableFields('upcoming');
    expect(Object.keys(fields)).toHaveLength(13);
    expect(Object.values(fields).every((rule) => rule === 'free')).toBe(true);
  });

  it('Đang mở và Đóng cửa vào thi: kéo dài giờ đóng, Thời lượng; đổi mã', () => {
    for (const phase of ['open', 'entry_closed'] as const) {
      expect(sessionEditableFields(phase)).toEqual({
        closesAt: 'grow',
        durationMinutes: 'grow',
        accessCode: 'free',
        reviewAfterRelease: 'free',
      });
    }
  });

  it('Đã đóng chỉ còn đổi được "xem lại bài sau Công bố"; Đã hủy: không ô nào', () => {
    expect(sessionEditableFields('closed')).toEqual({ reviewAfterRelease: 'free' });
    expect(sessionEditableFields('cancelled')).toEqual({});
  });
});

describe('sessionActivityOf: Phiên thi có đang diễn ra không (Q271)', () => {
  const inWindow = at('2026-12-01T02:00:00Z');

  it('trong Khung giờ là đang diễn ra dù chưa ai vào', () => {
    expect(sessionActivityOf(base, inWindow, false)).toBe('live');
  });

  it('ranh giới: đúng giờ mở và đúng giờ đóng vẫn đang diễn ra', () => {
    expect(sessionActivityOf(base, at('2026-12-01T01:00:00Z'), false)).toBe('live');
    expect(sessionActivityOf(base, at('2026-12-01T03:00:00Z'), false)).toBe('live');
  });

  it('trước giờ mở là sắp mở, sau giờ đóng là đã xong', () => {
    expect(sessionActivityOf(base, at('2026-12-01T00:59:59.999Z'), false)).toBe('upcoming');
    expect(sessionActivityOf(base, at('2026-12-01T03:00:00.001Z'), false)).toBe('done');
  });

  it('Lượt còn đang làm sau giờ đóng vẫn là đang diễn ra (được đủ Thời lượng)', () => {
    expect(sessionActivityOf(base, at('2026-12-01T03:40:00Z'), true)).toBe('live');
  });

  it('Đóng cửa vào thi không làm Phiên thi hết đang diễn ra', () => {
    const closedEntry = { ...base, entryClosedAt: at('2026-12-01T01:30:00Z') };
    expect(sessionActivityOf(closedEntry, inWindow, false)).toBe('live');
  });

  it('đã Hủy thắng tất cả, kể cả khi còn Lượt', () => {
    const cancelled = { ...base, cancelledAt: at('2026-12-01T01:45:00Z') };
    expect(sessionActivityOf(cancelled, inWindow, true)).toBe('cancelled');
    expect(sessionActivityOf(cancelled, at('2026-11-30T00:00:00Z'), false)).toBe('cancelled');
  });
});

describe('countSessionActivities', () => {
  it('đếm đủ bốn trạng thái và tổng', () => {
    const now = at('2026-12-01T02:00:00Z');
    const later = {
      ...base,
      opensAt: at('2026-12-02T01:00:00Z'),
      closesAt: at('2026-12-02T03:00:00Z'),
    };
    const earlier = {
      ...base,
      opensAt: at('2026-11-30T01:00:00Z'),
      closesAt: at('2026-11-30T03:00:00Z'),
    };
    const cancelled = { ...base, cancelledAt: at('2026-11-30T00:00:00Z') };
    const counts = countSessionActivities(
      [
        { ...base, hasInProgress: false },
        { ...earlier, hasInProgress: true },
        { ...later, hasInProgress: false },
        { ...earlier, hasInProgress: false },
        { ...earlier, hasInProgress: false },
        { ...cancelled, hasInProgress: false },
      ],
      now,
    );
    expect(counts).toEqual({ live: 2, upcoming: 1, done: 2, cancelled: 1, total: 6 });
  });

  it('danh sách rỗng ra toàn số 0', () => {
    expect(countSessionActivities([], at('2026-12-01T02:00:00Z'))).toEqual({
      live: 0,
      upcoming: 0,
      done: 0,
      cancelled: 0,
      total: 0,
    });
  });
});
