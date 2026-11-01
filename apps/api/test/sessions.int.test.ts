import { ACCESS_CODE_ALPHABET } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { type ExamRef, publishedExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let candidateCookie: string;
let exam: ExamRef;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  await seedUser({ username: 'sv1', roleTags: ['candidate'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  candidateCookie = (await login(t.app, 'sv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedExam(t, cookie);
});

const api = (method: string, path: string, body?: unknown, who = cookie) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie: who, body });

// Đồng hồ giả bắt đầu 08:00 ngày 2/11/2026 (GMT+7).
const settings = (over: Record<string, unknown> = {}) => ({
  examId: exam.id,
  title: 'Giữa kỳ - ca 1',
  opensAt: '2026-11-10T08:00:00+07:00',
  closesAt: '2026-11-10T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...over,
});

async function create(over: Record<string, unknown> = {}, who = cookie) {
  const res = await api('POST', '/sessions', settings(over), who);
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

describe('tạo và xem Phiên thi (Q202)', () => {
  it('tạo Phiên thi Sắp mở với mặc định, trả chi tiết', async () => {
    const session = await create();
    expect(session).toMatchObject({
      examId: exam.id,
      examTitle: exam.title,
      title: 'Giữa kỳ - ca 1',
      opensAt: '2026-11-10T01:00:00.000Z',
      closesAt: '2026-11-10T03:00:00.000Z',
      durationMinutes: 45,
      hardClose: false,
      maxAttempts: 1,
      attemptScoring: 'highest',
      shuffleItems: false,
      shuffleOptions: false,
      showScoringRules: false,
      accessCode: 'AB3K9X',
      phase: 'upcoming',
      version: 1,
      rosterCount: 0,
      cancelledAt: null,
    });
    expect((await api('GET', `/sessions/${session.id}`)).json()).toEqual(session);
  });

  it('chuẩn hóa Mã vào thi người dùng gõ', async () => {
    expect((await create({ accessCode: ' ab3-k9x ' })).accessCode).toBe('AB3K9X');
  });

  it('không nêu mã thì server sinh mã 6 ký tự từ bảng ký tự bỏ 0 O 1 I L', async () => {
    const { accessCode: _omit, ...rest } = settings();
    const res = await api('POST', '/sessions', rest);
    expect(res.statusCode, res.body).toBe(201);
    const code = res.json().accessCode as string;
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ACCESS_CODE_ALPHABET).toContain(ch);
  });

  it('Phiên thi của người khác coi như không tồn tại', async () => {
    const session = await create();
    expect((await api('GET', `/sessions/${session.id}`, undefined, otherCookie)).statusCode).toBe(
      404,
    );
  });

  it('Người dự thi không vào được khu Người ra đề', async () => {
    expect((await api('GET', '/sessions', undefined, candidateCookie)).statusCode).toBe(403);
    expect((await api('POST', '/sessions', settings(), candidateCookie)).statusCode).toBe(403);
  });

  it('thiết lập sai thì VALIDATION_FAILED chỉ đúng trường', async () => {
    const res = await api('POST', '/sessions', settings({ closesAt: '2026-11-10T08:00:00+07:00' }));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    expect(res.json().issues[0].path).toBe('closesAt');
  });

  it('trùng Mã vào thi khi Khung giờ chồng nhau thì CONFLICT ở accessCode', async () => {
    await create();
    const res = await api('POST', '/sessions', settings({ title: 'Ca 2' }), cookie);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT', field: 'accessCode' });
  });

  it('trùng mã nhưng Khung giờ khác ngày thì được', async () => {
    await create();
    await create({
      opensAt: '2026-11-11T08:00:00+07:00',
      closesAt: '2026-11-11T10:00:00+07:00',
    });
  });
});

describe('chọn Bộ đề cho Phiên thi', () => {
  it('Bộ đề nháp: exam_not_published', async () => {
    const draft = (await api('POST', '/exams', { title: 'Nháp' })).json();
    const res = await api('POST', '/sessions', settings({ examId: draft.id }));
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'examId', code: 'exam_not_published' }]);
  });

  it('Bộ đề đã Lưu trữ: exam_archived', async () => {
    const archived = await publishedExam(t, cookie, 'Cũ');
    await api('POST', `/exams/${archived.id}/archive`);
    const res = await api('POST', '/sessions', settings({ examId: archived.id }));
    expect(res.json().issues).toEqual([{ path: 'examId', code: 'exam_archived' }]);
  });

  it('Bộ đề của người khác hoặc không có: unknown_exam', async () => {
    const theirs = await publishedExam(t, otherCookie, 'Của người khác');
    for (const examId of [theirs.id, '0197a6f0-0000-7000-8000-000000000000']) {
      const res = await api('POST', '/sessions', settings({ examId }));
      expect(res.statusCode).toBe(400);
      expect(res.json().issues).toEqual([{ path: 'examId', code: 'unknown_exam' }]);
    }
  });
});

describe('danh sách Phiên thi', () => {
  it('chỉ thấy của mình, mới mở nhất trước, kèm tên Bộ đề và số người', async () => {
    const a = await create({ title: 'Ca A', accessCode: 'AAAA22' });
    const b = await create({
      title: 'Ca B',
      accessCode: 'BBBB22',
      opensAt: '2026-11-12T08:00:00+07:00',
      closesAt: '2026-11-12T10:00:00+07:00',
    });
    const theirs = await publishedExam(t, otherCookie, 'Của người khác');
    const theirSession = await api(
      'POST',
      '/sessions',
      settings({ examId: theirs.id, title: 'Của người khác' }),
      otherCookie,
    );
    expect(theirSession.statusCode, theirSession.body).toBe(201);
    const res = await api('GET', '/sessions');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items.map((s: { id: string }) => s.id)).toEqual([b.id, a.id]);
    expect(body.items[0]).toMatchObject({
      title: 'Ca B',
      examTitle: exam.title,
      phase: 'upcoming',
      rosterCount: 0,
    });
  });

  it('lọc theo trạng thái tính từ đồng hồ server', async () => {
    const soon = await create({ title: 'Sắp', accessCode: 'SOON22' });
    const now = await create({
      title: 'Đang',
      accessCode: 'NOW222',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T09:00:00+07:00',
    });
    const past = await create({
      title: 'Qua',
      accessCode: 'PAST22',
      opensAt: '2026-11-01T07:00:00+07:00',
      closesAt: '2026-11-01T09:00:00+07:00',
    });
    const ids = async (phase: string) =>
      (await api('GET', `/sessions?phase=${phase}`)).json().items.map((s: { id: string }) => s.id);
    expect(await ids('upcoming')).toEqual([soon.id]);
    expect(await ids('open')).toEqual([now.id]);
    expect(await ids('closed')).toEqual([past.id]);
    expect(await ids('cancelled')).toEqual([]);
  });

  it('tìm theo tên không dấu, không phân biệt hoa thường', async () => {
    await create({ title: 'Giải tích giữa kỳ', accessCode: 'GT2222' });
    await create({ title: 'Đại số', accessCode: 'DS2222' });
    const titles = async (q: string) =>
      (await api('GET', `/sessions?q=${encodeURIComponent(q)}`))
        .json()
        .items.map((s: { title: string }) => s.title);
    expect(await titles('giai tich')).toEqual(['Giải tích giữa kỳ']);
    expect(await titles('ĐẠI')).toEqual(['Đại số']);
  });
});

describe('sửa Phiên thi theo trạng thái (Q202)', () => {
  const update = (id: string, over: Record<string, unknown>, version = 1, who = cookie) =>
    api('PUT', `/sessions/${id}`, { ...settings(), version, ...over }, who);

  /** Phiên thi đang mở lúc 08:00 (mở 07:00, đóng 09:00). */
  const openSession = () =>
    create({
      title: 'Đang mở',
      accessCode: 'OPEN22',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T09:00:00+07:00',
    });

  it('Sắp mở: sửa được mọi thứ, version tăng', async () => {
    const session = await create();
    const res = await update(session.id, {
      title: 'Đổi tên',
      durationMinutes: 90,
      maxAttempts: 3,
      attemptScoring: 'latest',
      shuffleItems: true,
      shuffleOptions: true,
      showScoringRules: true,
      hardClose: true,
      accessCode: 'ZZ9K3X',
      closesAt: '2026-11-10T12:00:00+07:00',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      title: 'Đổi tên',
      durationMinutes: 90,
      maxAttempts: 3,
      attemptScoring: 'latest',
      shuffleItems: true,
      shuffleOptions: true,
      showScoringRules: true,
      hardClose: true,
      accessCode: 'ZZ9K3X',
      closesAt: '2026-11-10T05:00:00.000Z',
      version: 2,
    });
  });

  it('có thể đổi sang Bộ đề khác đã Phát hành khi còn Sắp mở', async () => {
    const session = await create();
    const other = await publishedExam(t, cookie, 'Cuối kỳ');
    const res = await update(session.id, { examId: other.id });
    expect(res.json()).toMatchObject({ examId: other.id, examTitle: 'Cuối kỳ' });
  });

  it('đổi sang Bộ đề nháp bị từ chối', async () => {
    const session = await create();
    const draft = (await api('POST', '/exams', { title: 'Nháp' })).json();
    const res = await update(session.id, { examId: draft.id });
    expect(res.json().issues).toEqual([{ path: 'examId', code: 'exam_not_published' }]);
  });

  it('version lệch là CONFLICT và không đổi gì', async () => {
    const session = await create();
    const res = await update(session.id, { title: 'Khác' }, 7);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT', field: 'version' });
    expect((await api('GET', `/sessions/${session.id}`)).json().title).toBe(session.title);
  });

  it('không nêu mã là giữ mã cũ', async () => {
    const session = await create();
    const { accessCode: _omit, ...rest } = settings({ title: 'Chỉ đổi tên' });
    const res = await api('PUT', `/sessions/${session.id}`, { ...rest, version: 1 });
    expect(res.json()).toMatchObject({ title: 'Chỉ đổi tên', accessCode: 'AB3K9X' });
  });

  it('đổi sang mã đang dùng trong cùng Khung giờ thì CONFLICT ở accessCode', async () => {
    await create({ accessCode: 'TAKEN2' });
    const mine = await create({ accessCode: 'MINE22' });
    const res = await update(mine.id, { accessCode: 'TAKEN2' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT', field: 'accessCode' });
  });

  it('Đang mở: kéo dài Khung giờ, Thời lượng và đổi mã được', async () => {
    const session = await openSession();
    expect(session.phase).toBe('open');
    const res = await update(session.id, {
      title: 'Đang mở',
      accessCode: 'NEW222',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T11:00:00+07:00',
      durationMinutes: 60,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ accessCode: 'NEW222', durationMinutes: 60, phase: 'open' });
  });

  it('Đang mở: rút ngắn bị cannot_shorten; đổi tên, xáo trộn, Bộ đề bị locked', async () => {
    const session = await openSession();
    const base = {
      title: 'Đang mở',
      accessCode: 'OPEN22',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T09:00:00+07:00',
    };
    const other = await publishedExam(t, cookie, 'Cuối kỳ');
    const issues = async (over: Record<string, unknown>) => {
      const res = await update(session.id, { ...base, ...over });
      expect(res.statusCode, res.body).toBe(400);
      return res.json().issues;
    };
    expect(await issues({ closesAt: '2026-11-02T08:30:00+07:00' })).toEqual([
      { path: 'closesAt', code: 'cannot_shorten' },
    ]);
    expect(await issues({ durationMinutes: 30 })).toEqual([
      { path: 'durationMinutes', code: 'cannot_shorten' },
    ]);
    expect(await issues({ title: 'Đổi tên' })).toEqual([{ path: 'title', code: 'locked' }]);
    expect(await issues({ shuffleItems: true })).toEqual([
      { path: 'shuffleItems', code: 'locked' },
    ]);
    expect(await issues({ examId: other.id })).toEqual([{ path: 'examId', code: 'locked' }]);
  });

  it('Đã đóng: không sửa gì, kể cả mã', async () => {
    const closed = await create({
      title: 'Qua',
      accessCode: 'PAST22',
      opensAt: '2026-11-01T07:00:00+07:00',
      closesAt: '2026-11-01T09:00:00+07:00',
    });
    const res = await update(closed.id, {
      title: 'Qua',
      accessCode: 'NEW222',
      opensAt: '2026-11-01T07:00:00+07:00',
      closesAt: '2026-11-01T09:00:00+07:00',
    });
    expect(res.json().issues).toEqual([{ path: 'accessCode', code: 'locked' }]);
  });

  it('Phiên thi của người khác coi như không tồn tại', async () => {
    const session = await create();
    expect((await update(session.id, {}, 1, otherCookie)).statusCode).toBe(404);
  });
});

describe('gợi ý Mã vào thi', () => {
  const suggest = (opens: string, closes: string) =>
    api(
      'GET',
      `/sessions/access-code-suggestion?opensAt=${encodeURIComponent(opens)}&closesAt=${encodeURIComponent(closes)}`,
    );

  it('trả một mã chưa dùng trong Khung giờ', async () => {
    await create({ accessCode: 'AAAA22' });
    const res = await suggest('2026-11-10T08:00:00+07:00', '2026-11-10T10:00:00+07:00');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().accessCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.json().accessCode).not.toBe('AAAA22');
  });

  it('Khung giờ ngược là 400, không phải lỗi máy chủ', async () => {
    const res = await suggest('2026-11-10T10:00:00+07:00', '2026-11-10T08:00:00+07:00');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
  });
});
