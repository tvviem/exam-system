import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_SESSION_GUARD } from '../src/common/live-session-guard';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { fullExam, Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Q218: Khóa đăng nhập hoặc Xóa người dùng thì Lượt đang làm được nộp (account_locked). Từ Q264, Quản trị viên không Khóa hay
// Xóa được người đang trong Phiên thi đang diễn ra (xem session-owner-removal); hook này là lớp phòng thủ cho lúc hai việc gần
// như đồng thời, nên test giả lập cổng cảnh báo trả "không có Phiên thi nào" để đi tới hook.

let t: TestApp;
let admin: string;
let anId: string;
let binhId: string;
let sessionId: string;
let an: Taker;

beforeAll(async () => {
  t = await createTestApp();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await t.app.close();
});

const adminApi = (method: 'POST' | 'DELETE', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: admin, body });

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'quantri', isAdmin: true });
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  binhId = (await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] })).id;
  admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
  const examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  const exam = await fullExam(t, examiner);
  const created = await call(t.app, 'POST', '/api/sessions', {
    cookie: examiner,
    body: {
      examId: exam.id,
      title: 'Ca 1',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'AB3K9X',
    },
  });
  sessionId = created.json().id;
  await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
    cookie: examiner,
    body: { userIds: [anId, binhId] },
  });
  an = await Taker.signIn(t, 'an');
  await an.join('AB3K9X');
  await an.call('POST', `/take/sessions/${sessionId}/start`);
  vi.spyOn(t.app.get(LIVE_SESSION_GUARD), 'liveSessionsOf').mockResolvedValue([]);
});

const attempts = () =>
  sql<{ user_id: string; status: string; submit_reason: string | null }>(
    `select user_id, status, submit_reason from attempts`,
  );

describe('Khóa đăng nhập giữa lúc đang thi (Q218)', () => {
  it('Lượt đang làm được nộp với lý do account_locked; Mở khóa không mở lại Lượt', async () => {
    const res = await adminApi('POST', `/admin/users/${anId}/lock`, { reason: 'Nghi gian lận' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await attempts()).toEqual([
      { user_id: anId, status: 'submitted', submit_reason: 'account_locked' },
    ]);
    await adminApi('POST', `/admin/users/${anId}/unlock`, {});
    expect((await attempts())[0]?.status).toBe('submitted');
  });

  it('chỉ nộp Lượt của người bị khóa, không đụng người khác', async () => {
    const binh = await Taker.signIn(t, 'binh');
    await binh.join('AB3K9X');
    await binh.call('POST', `/take/sessions/${sessionId}/start`);
    await adminApi('POST', `/admin/users/${anId}/lock`, { reason: 'x' });
    const rows = await attempts();
    expect(rows.find((r) => r.user_id === binhId)).toMatchObject({ status: 'in_progress' });
    expect(rows.find((r) => r.user_id === anId)).toMatchObject({ status: 'submitted' });
  });
});

describe('Xóa người dùng giữa lúc đang thi (Q205, Q218)', () => {
  it('Lượt đang làm của người bị Xóa được nộp tự động', async () => {
    const res = await adminApi('DELETE', `/admin/users/${anId}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(await attempts()).toEqual([
      { user_id: anId, status: 'submitted', submit_reason: 'account_locked' },
    ]);
  });
});
