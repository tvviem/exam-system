import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type ExamRef, publishedExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let gv1: string;
let gv2: string;
let exam: ExamRef;
let sessionId: string;

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
  gv1 = (await seedUser({ username: 'gv1', roleTags: ['examiner'] })).id;
  gv2 = (await seedUser({ username: 'gv2', roleTags: ['examiner'] })).id;
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedExam(t, cookie);
  const created = await api('POST', '/sessions', {
    examId: exam.id,
    title: 'Giữa kỳ - ca 1',
    opensAt: '2026-11-10T08:00:00+07:00',
    closesAt: '2026-11-10T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'AB3K9X',
  });
  sessionId = created.json().id;
});

/** Người dự thi được cấp tài khoản qua Yêu cầu cấp tài khoản của `requestedBy` và chưa đổi mật khẩu tạm. */
async function requestedCandidate(requestedBy: string, username: string, mustChange = true) {
  const user = await seedUser({
    username,
    roleTags: ['candidate'],
    mustChangePassword: mustChange,
    password: 'mat-khau-tam-1',
  });
  const [request] = await sql<{ id: string }>(
    `insert into account_requests (id, requested_by, original_filename, status)
     values (gen_random_uuid(), $1, 'ds.xlsx', 'approved') returning id`,
    [requestedBy],
  );
  await sql(
    `insert into account_request_items (id, request_id, row_number, match_status, outcome, user_id)
     values (gen_random_uuid(), $1, 1, 'new', 'created', $2)`,
    [(request as { id: string }).id, user.id],
  );
  return user.id;
}

const addToRoster = (userId: string) =>
  api('POST', `/sessions/${sessionId}/roster`, { userIds: [userId] });
const reissue = (userId: string, who = cookie) =>
  api('POST', `/sessions/${sessionId}/roster/${userId}/reissue-password`, undefined, who);

describe('Người ra đề cấp lại mật khẩu tạm cho Người dự thi trong Danh sách (Q2 của 4a)', () => {
  it('cấp mật khẩu mới hiện một lần, hạn 7 ngày; mật khẩu cũ hết dùng, phiên cũ bị thu hồi', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    await addToRoster(id);
    const oldLogin = await login(t.app, 'sv1', 'mat-khau-tam-1');
    expect(oldLogin.res.statusCode).toBe(200);

    const res = await reissue(id);
    expect(res.statusCode, res.body).toBe(200);
    const { temporaryPassword, passwordExpiresAt } = res.json();
    expect(temporaryPassword).toHaveLength(10);
    expect(new Date(passwordExpiresAt).getTime()).toBe(
      t.clock.now().getTime() + 7 * 24 * 3_600_000,
    );

    expect((await login(t.app, 'sv1', 'mat-khau-tam-1')).res.statusCode).toBe(401);
    expect((await login(t.app, 'sv1', temporaryPassword)).res.statusCode).toBe(200);
    // phiên đăng nhập cũ không còn dùng được
    expect((await api('GET', '/notifications', undefined, oldLogin.cookie)).statusCode).toBe(401);
  });

  it('ghi nhật ký thao tác (không kèm mật khẩu) và báo cho chính Người dự thi', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    await addToRoster(id);
    const { temporaryPassword } = (await reissue(id)).json();

    const logs = await sql<{ actor_id: string; entity_id: string; after: object }>(
      `select actor_id, entity_id, after from audit_logs where action = 'user.temporary-password.reissue'`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor_id: gv1, entity_id: id });
    // vết đủ để truy: Người ra đề nào cấp, qua Phiên thi nào
    expect(logs[0]?.after).toMatchObject({ via: 'session-roster', sessionId });
    const everything = JSON.stringify([
      await sql('select * from audit_logs'),
      await sql('select * from notifications'),
    ]);
    expect(everything).not.toContain(temporaryPassword);

    const notices = await sql<{ user_id: string; data: object }>(
      `select user_id, data from notifications where type = 'account.password_reissued'`,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ user_id: id, data: { sessionId } });
  });

  it('từ chối người đã tự đổi mật khẩu: nhờ Quản trị viên (ASK_ADMIN)', async () => {
    const id = await requestedCandidate(gv1, 'sv1', false);
    await addToRoster(id);
    const res = await reissue(id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ASK_ADMIN' });
    expect((await login(t.app, 'sv1', 'mat-khau-tam-1')).res.statusCode).toBe(200);
  });

  it('từ chối tài khoản không do Yêu cầu cấp tài khoản của chính mình tạo', async () => {
    const byOther = await requestedCandidate(gv2, 'sv2');
    const byAdmin = (
      await seedUser({ username: 'sv3', roleTags: ['candidate'], mustChangePassword: true })
    ).id;
    await addToRoster(byOther);
    await addToRoster(byAdmin);
    for (const id of [byOther, byAdmin]) {
      const res = await reissue(id);
      expect(res.json(), id).toMatchObject({ code: 'INVALID_STATE', reason: 'ASK_ADMIN' });
    }
  });

  it('từ chối người đã Khóa đăng nhập', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    await addToRoster(id);
    await sql(`update users set status = 'locked' where id = $1`, [id]);
    expect((await reissue(id)).json()).toMatchObject({ reason: 'ASK_ADMIN' });
  });

  it('người không có trong Danh sách, hoặc Phiên thi của người khác: 404', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    expect((await reissue(id)).statusCode).toBe(404);
    await addToRoster(id);
    await seedUser({ username: 'gv3', roleTags: ['examiner'] });
    const otherCookie = (await login(t.app, 'gv3', DEFAULT_PASSWORD)).cookie as string;
    expect((await reissue(id, otherCookie)).statusCode).toBe(404);
  });

  it('Phiên thi Đã đóng thì không cấp', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    await addToRoster(id);
    await sql(
      `update sessions set opens_at = '2026-10-01T00:00Z', closes_at = '2026-10-02T00:00Z'`,
    );
    const res = await reissue(id);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'WINDOW_CLOSED' });
  });

  it('Người dự thi không gọi được', async () => {
    const id = await requestedCandidate(gv1, 'sv1');
    await addToRoster(id);
    const candidateCookie = (await login(t.app, 'sv1', 'mat-khau-tam-1')).cookie as string;
    expect((await reissue(id, candidateCookie)).statusCode).toBe(403);
  });
});
