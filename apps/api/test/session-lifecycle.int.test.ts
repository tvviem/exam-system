import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type ExamRef, publishedExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;
let exam: ExamRef;
let an: string;
let binh: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: string, path: string, body?: unknown, who = cookie) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie: who, body });

beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  an = (
    await seedUser({
      username: 'an',
      code: 'SV001',
      fullName: 'Nguyễn Văn An',
      classLabel: 'K65-A',
      roleTags: ['candidate'],
    })
  ).id;
  binh = (
    await seedUser({
      username: 'binh',
      code: 'SV002',
      fullName: 'Trần Thị Bình',
      classLabel: 'K65-A',
      roleTags: ['candidate'],
    })
  ).id;
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedExam(t, cookie);
});

const settings = (over: Record<string, unknown> = {}) => ({
  examId: exam.id,
  title: 'Giữa kỳ - ca 1',
  opensAt: '2026-11-10T08:00:00+07:00',
  closesAt: '2026-11-10T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...over,
});

async function create(over: Record<string, unknown> = {}) {
  const res = await api('POST', '/sessions', settings(over));
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

const notices = (type: string) =>
  sql<{ user_id: string; data: Record<string, unknown> }>(
    `select user_id, data from notifications where type = $1 order by user_id`,
    [type],
  );

describe('Hủy Phiên thi (Q203)', () => {
  it('Hủy ghi người hủy, lý do, chuyển sang Đã hủy và báo người trong Danh sách', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/roster`, { userIds: [an, binh] });
    const res = await api('POST', `/sessions/${session.id}/cancel`, { reason: 'Mất điện' });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ phase: 'cancelled', cancelReason: 'Mất điện' });
    expect(res.json().cancelledAt).not.toBeNull();
    const sent = await notices('session.cancelled');
    expect(sent.map((n) => n.user_id).sort()).toEqual([an, binh].sort());
    expect(sent[0]?.data).toMatchObject({ sessionId: session.id, title: 'Giữa kỳ - ca 1' });
  });

  it('không hoàn tác: hủy lần nữa, sửa, thêm người đều bị từ chối', async () => {
    const session = await create();
    const cancelled = (await api('POST', `/sessions/${session.id}/cancel`, {})).json();
    const again = await api('POST', `/sessions/${session.id}/cancel`, {});
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'SESSION_CANCELLED' });
    const edit = await api('PUT', `/sessions/${session.id}`, {
      ...settings({ title: 'Khác' }),
      version: cancelled.version,
    });
    expect(edit.statusCode).toBe(400);
    expect(edit.json().issues).toEqual([{ path: 'title', code: 'locked' }]);
    const addPeople = await api('POST', `/sessions/${session.id}/roster`, { userIds: [an] });
    expect(addPeople.json()).toMatchObject({ reason: 'SESSION_CANCELLED' });
  });

  it('Hủy nhả Mã vào thi cho Phiên thi khác dùng', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/cancel`, {});
    await create({ title: 'Ca bù' });
  });

  it('lý do không bắt buộc nhưng không quá 500 ký tự; người khác nhận 404', async () => {
    const session = await create();
    expect(
      (await api('POST', `/sessions/${session.id}/cancel`, { reason: 'x'.repeat(501) })).statusCode,
    ).toBe(400);
    expect((await api('POST', `/sessions/${session.id}/cancel`, {}, otherCookie)).statusCode).toBe(
      404,
    );
    expect((await api('POST', `/sessions/${session.id}/cancel`, {})).statusCode).toBe(200);
  });

  it('lọc danh sách theo trạng thái Đã hủy', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/cancel`, {});
    const listed = (await api('GET', '/sessions?phase=cancelled')).json();
    expect(listed.items.map((s: { id: string }) => s.id)).toEqual([session.id]);
    expect((await api('GET', '/sessions?phase=upcoming')).json().total).toBe(0);
  });
});

describe('Xóa Phiên thi (Q202)', () => {
  it('xóa Phiên thi chưa có Lượt làm bài, kèm Danh sách; báo người đã được thêm', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/roster`, { userIds: [an] });
    const res = await api('DELETE', `/sessions/${session.id}`);
    expect(res.statusCode, res.body).toBe(200);
    expect((await api('GET', `/sessions/${session.id}`)).statusCode).toBe(404);
    expect(await sql('select 1 from session_roster')).toHaveLength(0);
    expect((await notices('session.cancelled')).map((n) => n.user_id)).toEqual([an]);
  });

  it('xóa Phiên thi đã hủy không báo lần nữa', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/roster`, { userIds: [an] });
    await api('POST', `/sessions/${session.id}/cancel`, {});
    await api('DELETE', `/sessions/${session.id}`);
    expect(await notices('session.cancelled')).toHaveLength(1);
  });

  it('người khác nhận 404 và Phiên thi còn nguyên', async () => {
    const session = await create();
    expect(
      (await api('DELETE', `/sessions/${session.id}`, undefined, otherCookie)).statusCode,
    ).toBe(404);
    expect((await api('GET', `/sessions/${session.id}`)).statusCode).toBe(200);
  });
});

describe('Nhân bản Phiên thi (Q203)', () => {
  it('sao chép thiết lập và Danh sách, sang tuần sau, mã mới, Sắp mở', async () => {
    const session = await create({
      maxAttempts: 2,
      attemptScoring: 'latest',
      shuffleItems: true,
      shuffleOptions: true,
      showScoringRules: true,
      hardClose: true,
    });
    await api('POST', `/sessions/${session.id}/roster`, { userIds: [an, binh] });
    await api('PATCH', `/sessions/${session.id}/roster/${an}`, { extraMinutes: 15 });
    await api('POST', `/sessions/${session.id}/cancel`, {}); // bản gốc đã hủy vẫn nhân bản được
    await sql('delete from notifications');

    const res = await api('POST', `/sessions/${session.id}/duplicate`);
    expect(res.statusCode, res.body).toBe(201);
    const copy = res.json();
    expect(copy.id).not.toBe(session.id);
    expect(copy).toMatchObject({
      examId: exam.id,
      title: 'Giữa kỳ - ca 1 (bản sao)',
      opensAt: '2026-11-17T01:00:00.000Z',
      closesAt: '2026-11-17T03:00:00.000Z',
      durationMinutes: 45,
      maxAttempts: 2,
      attemptScoring: 'latest',
      shuffleItems: true,
      shuffleOptions: true,
      showScoringRules: true,
      hardClose: true,
      phase: 'upcoming',
      rosterCount: 2,
      cancelledAt: null,
      version: 1,
    });
    expect(copy.accessCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(copy.accessCode).not.toBe('AB3K9X');

    const listed = (await api('GET', `/sessions/${copy.id}/roster`)).json().items;
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: an, extraMinutes: 15, classLabel: 'K65-A' }),
        expect.objectContaining({ userId: binh, extraMinutes: 0 }),
      ]),
    );
    expect((await notices('session.added')).map((n) => n.user_id).sort()).toEqual(
      [an, binh].sort(),
    );
  });

  it('bản gốc đã qua thì bản sao dời theo tuần đến ngày còn tới', async () => {
    const past = await create({
      opensAt: '2026-10-20T08:00:00+07:00', // 13 ngày trước đồng hồ giả (2/11)
      closesAt: '2026-10-20T10:00:00+07:00',
    });
    const copy = (await api('POST', `/sessions/${past.id}/duplicate`)).json();
    expect(copy.opensAt).toBe('2026-11-03T01:00:00.000Z'); // cộng 2 tuần
    expect(copy.phase).toBe('upcoming');
  });

  it('bản sao bỏ người đã Khóa, đã Xóa hay không còn là Người dự thi', async () => {
    const session = await create();
    await api('POST', `/sessions/${session.id}/roster`, { userIds: [an, binh] });
    await sql(`update users set status = 'locked' where id = $1`, [an]);
    await sql(`delete from user_role_tags where user_id = $1`, [binh]);
    const copy = (await api('POST', `/sessions/${session.id}/duplicate`)).json();
    expect(copy.rosterCount).toBe(0);
  });

  it('Bộ đề đã Lưu trữ thì không nhân bản được', async () => {
    const session = await create();
    await api('POST', `/exams/${exam.id}/archive`);
    const res = await api('POST', `/sessions/${session.id}/duplicate`);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'examId', code: 'exam_archived' }]);
  });

  it('tên dài vẫn không vượt 200 ký tự; người khác nhận 404', async () => {
    const session = await create({ title: 'T'.repeat(200) });
    const copy = (await api('POST', `/sessions/${session.id}/duplicate`)).json();
    expect(copy.title).toHaveLength(200);
    expect(copy.title.endsWith(' (bản sao)')).toBe(true);
    expect(
      (await api('POST', `/sessions/${session.id}/duplicate`, undefined, otherCookie)).statusCode,
    ).toBe(404);
  });
});
