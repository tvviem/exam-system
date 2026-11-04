import { z } from 'zod';

// Luật thuần của Phiên thi, dùng chung cho web và api (docs/plan/slice-4.md, Q192–Q222).

export const SESSION_PHASES = ['upcoming', 'open', 'entry_closed', 'closed', 'cancelled'] as const;
/** Sắp mở, Đang mở, Đóng cửa vào thi, Đã đóng, Đã hủy (Q202). */
export type SessionPhase = (typeof SESSION_PHASES)[number];

export interface SessionTimes {
  opensAt: Date;
  closesAt: Date;
  entryClosedAt: Date | null;
  cancelledAt: Date | null;
}

/**
 * Trạng thái của Phiên thi tại `now`. Giờ đóng là giờ cuối cùng được bắt đầu làm bài, nên đúng giờ đóng vẫn còn mở.
 * Đã hủy thắng tất cả; qua giờ đóng là Đã đóng dù trước đó đã Đóng cửa vào thi.
 */
export function phaseOf(session: SessionTimes, now: Date): SessionPhase {
  if (session.cancelledAt) return 'cancelled';
  if (now < session.opensAt) return 'upcoming';
  if (now > session.closesAt) return 'closed';
  if (session.entryClosedAt && session.entryClosedAt <= now) return 'entry_closed';
  return 'open';
}

export const SESSION_ACTIVITIES = ['live', 'upcoming', 'done', 'cancelled'] as const;
/** Đang diễn ra, sắp mở, đã xong, đã Hủy: cách đếm Phiên thi khi Xóa hay Khóa người dùng (Q263, Q271). */
export type SessionActivity = (typeof SESSION_ACTIVITIES)[number];

/**
 * Phiên thi "đang diễn ra" (Q271): chưa Hủy và (đang trong Khung giờ hoặc còn Lượt đang làm, vì Lượt có thể chạy quá
 * giờ đóng để đủ Thời lượng). Đóng cửa vào thi không làm Phiên thi hết đang diễn ra.
 */
export function sessionActivityOf(
  session: SessionTimes,
  now: Date,
  hasInProgress: boolean,
): SessionActivity {
  if (session.cancelledAt) return 'cancelled';
  if (now < session.opensAt) return 'upcoming';
  if (now <= session.closesAt || hasInProgress) return 'live';
  return 'done';
}

export interface SessionActivityCounts extends Record<SessionActivity, number> {
  total: number;
}

export function countSessionActivities(
  sessions: (SessionTimes & { hasInProgress: boolean })[],
  now: Date,
): SessionActivityCounts {
  const counts: SessionActivityCounts = { live: 0, upcoming: 0, done: 0, cancelled: 0, total: 0 };
  for (const session of sessions) {
    counts[sessionActivityOf(session, now, session.hasInProgress)] += 1;
    counts.total += 1;
  }
  return counts;
}

/** Bảng ký tự của Mã vào thi sinh tự động: chữ hoa và số, bỏ 0, O, 1, I, L dễ nhầm khi đọc (Q201). */
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 6;

/** Không phân biệt hoa thường, bỏ khoảng trắng và gạch nối khi gõ hoặc đọc mã qua lời. */
export const normalizeAccessCode = (raw: string): string =>
  raw.replace(/[\s-]+/g, '').toUpperCase();

/** `randomInt(max)` trả số nguyên trong [0, max); server truyền bộ sinh an toàn mật mã, test truyền bộ giả. */
export function generateAccessCode(randomInt: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/** Tách danh sách Mã định danh dán vào: theo dòng, dấu phẩy, chấm phẩy, khoảng trắng; bỏ trùng không phân biệt hoa thường. */
export function parseCodeList(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const code of text.split(/[\s,;]+/)) {
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    result.push(code);
  }
  return result;
}

export const SESSION_TITLE_MAX = 200;
export const SESSION_DURATION_MIN = 1;
export const SESSION_DURATION_MAX = 600;
export const SESSION_ATTEMPTS_MAX = 5;
export const SESSION_ROSTER_MAX = 500;
export const ACCESS_CODE_MIN_LENGTH = 4;
export const ACCESS_CODE_MAX_LENGTH = 12;

const title = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(SESSION_TITLE_MAX));

/** Giờ phải có múi giờ rõ ràng; giao diện luôn gửi giờ Việt Nam (GMT+7) đã đổi sang ISO. */
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const accessCode = z
  .string()
  .transform(normalizeAccessCode)
  .pipe(
    z.string().regex(new RegExp(`^[A-Z0-9]{${ACCESS_CODE_MIN_LENGTH},${ACCESS_CODE_MAX_LENGTH}}$`)),
  );

/** Thiết lập một Phiên thi (Q199–Q202, Q208). Không có `accessCode` thì server gợi ý khi tạo. */
const settingsShape = {
  examId: z.uuid(),
  title,
  opensAt: instant,
  closesAt: instant,
  durationMinutes: z.number().int().min(SESSION_DURATION_MIN).max(SESSION_DURATION_MAX),
  hardClose: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(SESSION_ATTEMPTS_MAX).default(1),
  attemptScoring: z.enum(['highest', 'latest']).default('highest'),
  shuffleItems: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showScoringRules: z.boolean().default(false),
  accessCode: accessCode.optional(),
};
const closesAfterOpens = {
  path: ['closesAt'],
  message: 'closes_not_after_opens',
};

/** Thiết lập một Phiên thi (Q199–Q202, Q208). Không có `accessCode` thì server gợi ý khi tạo. */
export const sessionSettingsSchema = z
  .strictObject(settingsShape)
  .refine((value) => value.closesAt > value.opensAt, closesAfterOpens);

/** Sửa Phiên thi: thiết lập đầy đủ kèm `version` (khóa lạc quan). Không có `accessCode` là giữ mã cũ. */
export const sessionUpdateSchema = z
  .strictObject({ ...settingsShape, version: z.number().int().min(1) })
  .refine((value) => value.closesAt > value.opensAt, closesAfterOpens);
export type SessionSettings = z.output<typeof sessionSettingsSchema>;
export type SessionUpdate = z.output<typeof sessionUpdateSchema>;

type Comparable = Omit<SessionSettings, 'accessCode'> & { accessCode?: string };
export interface SessionChangeProblem {
  path: keyof SessionSettings;
  code: 'locked' | 'cannot_shorten';
}

/** Trường nào được đổi ở trạng thái nào (Q202); `grow` là chỉ được tăng. */
const EDITABLE: Record<SessionPhase, Partial<Record<keyof SessionSettings, 'free' | 'grow'>>> = {
  upcoming: {
    examId: 'free',
    title: 'free',
    opensAt: 'free',
    closesAt: 'free',
    durationMinutes: 'free',
    hardClose: 'free',
    maxAttempts: 'free',
    attemptScoring: 'free',
    shuffleItems: 'free',
    shuffleOptions: 'free',
    showScoringRules: 'free',
    accessCode: 'free',
  },
  open: { closesAt: 'grow', durationMinutes: 'grow', accessCode: 'free' },
  entry_closed: { closesAt: 'grow', durationMinutes: 'grow', accessCode: 'free' },
  closed: {},
  cancelled: {},
};

/** Ô nào sửa được ở trạng thái `phase`: `free` tự do, `grow` chỉ được tăng. Giao diện dùng để khóa ô. */
export const sessionEditableFields = (phase: SessionPhase) => EDITABLE[phase];

const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value);

/** Những thay đổi không được phép khi sửa Phiên thi đang ở trạng thái `phase` (Q202). Rỗng nghĩa là hợp lệ. */
export function sessionChangeProblems(
  phase: SessionPhase,
  before: Comparable,
  after: Comparable,
): SessionChangeProblem[] {
  const rules = EDITABLE[phase];
  const problems: SessionChangeProblem[] = [];
  for (const path of Object.keys(settingsShape) as (keyof SessionSettings)[]) {
    const from = comparable(before[path]);
    const to = comparable(after[path]);
    if (from === to) continue;
    const rule = rules[path];
    if (!rule) problems.push({ path, code: 'locked' });
    else if (rule === 'grow' && (to as number) < (from as number))
      problems.push({ path, code: 'cannot_shorten' });
  }
  return problems;
}
