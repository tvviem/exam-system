import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { days } from './support/fake-clock';
import { call, login, sessionCookieOf } from './support/http';
import { resetState } from './support/reset';
import { seedUnit } from './support/units';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let adminCookie: string;
let unitId: string;

const EMAIL = 'giang.vien@example.edu.vn';
const NEW_PASSWORD = 'mat-khau-moi-rat-dai';

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' });
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  unitId = (await seedUnit('CNTT', 'Khoa CNTT')).id;
});

const asAdmin = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) => call(t.app, method, url, { cookie: adminCookie, body });

/** Quản trị viên tạo Lời mời; trả token như người dùng nhận được trong link. */
async function invite(email = EMAIL): Promise<{ id: string; token: string }> {
  const res = await asAdmin('POST', '/api/admin/invitations', {
    email,
    fullName: 'Lê Thị Giảng',
    unitId,
  });
  return res.json();
}
/** Quản trị viên đăng nhập lại sau khi kéo Clock (phiên Quản trị viên sống 30 phút). */
const advance = async (ms: number) => {
  t.clock.advance(ms);
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
};
const preview = (token: string, ip?: string) =>
  call(t.app, 'GET', `/api/invitations/${token}`, { ip });
const accept = (token: string, body: unknown, cookie?: string) =>
  call(t.app, 'POST', `/api/invitations/${token}/accept`, { body, cookie });
const statusOf = async (id: string) =>
  (await asAdmin('GET', '/api/admin/invitations'))
    .json()
    .items.find((i: { id: string }) => i.id === id).status;
const unavailable = { code: 'INVITATION_UNAVAILABLE' };

describe('xem Lời mời bằng link (không cần đăng nhập)', () => {
  it('trả email, họ tên, Đơn vị và việc email đã có tài khoản hay chưa', async () => {
    const { token } = await invite();
    const res = await preview(token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      email: EMAIL,
      fullName: 'Lê Thị Giảng',
      unitName: 'Khoa CNTT',
      accountExists: false,
    });

    await seedUser({ email: EMAIL.toUpperCase(), roleTags: ['candidate'] });
    expect((await preview(token)).json().accountExists).toBe(true);
  });

  it('link sai, hết hạn, đã thu hồi, đã được thay bằng link mới đều cùng một lỗi (Q81)', async () => {
    expect(await preview('x'.repeat(43))).toMatchObject({ statusCode: 404 });
    expect((await preview('x'.repeat(43))).json()).toEqual(unavailable);

    const revoked = await invite('a@example.edu.vn');
    await asAdmin('POST', `/api/admin/invitations/${revoked.id}/revoke`);
    expect((await preview(revoked.token)).json()).toEqual(unavailable);

    const replaced = await invite('b@example.edu.vn');
    await asAdmin('POST', `/api/admin/invitations/${replaced.id}/regenerate`);
    expect((await preview(replaced.token)).json()).toEqual(unavailable);

    const expiring = await invite('c@example.edu.vn');
    await advance(days(7));
    expect((await preview(expiring.token)).json()).toEqual(unavailable);
  });

  it('giới hạn 30 lần mỗi 10 phút mỗi IP', async () => {
    for (let i = 0; i < 30; i++) await preview('x'.repeat(43), '10.9.9.9');
    const res = await preview('x'.repeat(43), '10.9.9.9');
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect((await preview('x'.repeat(43), '10.9.9.10')).statusCode).toBe(404);
  });
});

describe('nhận Lời mời khi chưa có tài khoản (Q82)', () => {
  it('tạo tài khoản Người ra đề, đăng nhập luôn, link dùng một lần', async () => {
    const { id, token } = await invite();
    const res = await accept(token, {
      password: NEW_PASSWORD,
      academicDegree: 'master',
      academicTitle: 'associate_professor',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, createdAccount: true });
    const cookie = sessionCookieOf(res) as string;
    expect(cookie).toBeTruthy();

    const me = (await call(t.app, 'GET', '/api/auth/me', { cookie })).json();
    expect(me).toMatchObject({
      fullName: 'Lê Thị Giảng',
      isAdmin: false,
      roleTags: ['examiner'],
      mustChangePassword: false,
    });

    const detail = (await asAdmin('GET', `/api/admin/users/${me.id}`)).json();
    expect(detail).toMatchObject({
      email: EMAIL,
      username: null,
      examinerProfile: {
        academicDegree: 'master',
        academicTitle: 'associate_professor',
        unitId,
        unitName: 'Khoa CNTT',
      },
    });

    expect(await statusOf(id)).toBe('accepted');
    expect(await accept(token, { password: NEW_PASSWORD })).toMatchObject({ statusCode: 404 });
    expect((await login(t.app, EMAIL, NEW_PASSWORD)).res.statusCode).toBe(200);

    const events = (await asAdmin('GET', `/api/admin/login-events?userId=${me.id}`)).json().items;
    expect(events.map((e: { success: boolean }) => e.success)).toEqual([true, true]);
    const logs = (await asAdmin('GET', `/api/admin/audit-logs?entityId=${id}`)).json();
    expect(logs.items[0]).toMatchObject({
      action: 'invitation.accept',
      actorId: me.id,
      after: { userId: me.id, createdAccount: true },
    });
    expect(JSON.stringify(logs)).not.toContain(token);
  });

  it('học vị và học hàm không bắt buộc', async () => {
    const { token } = await invite();
    const res = await accept(token, { password: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    const me = (await call(t.app, 'GET', '/api/auth/me', { cookie: sessionCookieOf(res) })).json();
    const detail = (await asAdmin('GET', `/api/admin/users/${me.id}`)).json();
    expect(detail.examinerProfile).toMatchObject({ academicDegree: null, academicTitle: null });
  });

  it('mật khẩu vi phạm chính sách thì từ chối và link vẫn dùng được', async () => {
    const { id, token } = await invite();
    for (const password of ['ngan', EMAIL]) {
      const res = await accept(token, { password });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'PASSWORD_POLICY' });
    }
    expect((await accept(token, {})).json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await statusOf(id)).toBe('pending');
  });

  it('hai người nhận cùng lúc: chỉ một người thành công', async () => {
    const { token } = await invite();
    const results = await Promise.all([
      accept(token, { password: NEW_PASSWORD }),
      accept(token, { password: `${NEW_PASSWORD}-khac` }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    const users = (await asAdmin('GET', '/api/admin/users?q=giang.vien')).json();
    expect(users.total).toBe(1);
  });
});

describe('nhận Lời mời khi email đã có tài khoản (Q83)', () => {
  const existing = async (input: Parameters<typeof seedUser>[0] = {}) => {
    const user = await seedUser({
      username: 'giang',
      email: EMAIL,
      fullName: 'Lê Thị Giảng',
      roleTags: ['candidate'],
      ...input,
    });
    const cookie = (await login(t.app, 'giang', DEFAULT_PASSWORD)).cookie as string;
    return { ...user, cookie };
  };

  it('chưa đăng nhập thì 401 và link vẫn dùng được', async () => {
    await existing();
    const { id, token } = await invite();
    const res = await accept(token, {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await statusOf(id)).toBe('pending');
  });

  it('đăng nhập bằng tài khoản có email khác thì 403', async () => {
    await existing();
    const { id, token } = await invite();
    await seedUser({ username: 'khac', email: 'khac@example.edu.vn' });
    const other = (await login(t.app, 'khac', DEFAULT_PASSWORD)).cookie as string;
    const res = await accept(token, {}, other);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(await statusOf(id)).toBe('pending');
  });

  it('đúng tài khoản: thêm nhãn examiner và hồ sơ, giữ nguyên nhãn cũ, không tạo tài khoản mới', async () => {
    const account = await existing();
    const { token } = await invite();
    const res = await accept(token, { academicDegree: 'doctor' }, account.cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, createdAccount: false });
    expect(sessionCookieOf(res)).toBeUndefined();

    const detail = (await asAdmin('GET', `/api/admin/users/${account.id}`)).json();
    expect(detail.roleTags).toEqual(['examiner', 'candidate']);
    expect(detail.examinerProfile).toMatchObject({ academicDegree: 'doctor', unitId });
    expect((await asAdmin('GET', '/api/admin/users')).json().total).toBe(2);
  });

  it('hồ sơ Người ra đề có sẵn chỉ được điền ô còn trống', async () => {
    const account = await existing();
    // Trước đây đã là Người ra đề, sau bị gỡ nhãn: hồ sơ được giữ (Q64).
    await asAdmin('PUT', `/api/admin/users/${account.id}/role-tags/examiner`);
    await asAdmin('PATCH', `/api/admin/users/${account.id}`, {
      examinerProfile: { academicDegree: 'engineer' },
    });
    await asAdmin('DELETE', `/api/admin/users/${account.id}/role-tags/examiner`);

    const { token } = await invite();
    await accept(token, { academicDegree: 'doctor', academicTitle: 'professor' }, account.cookie);
    const detail = (await asAdmin('GET', `/api/admin/users/${account.id}`)).json();
    expect(detail.examinerProfile).toMatchObject({
      academicDegree: 'engineer',
      academicTitle: 'professor',
      unitId,
    });
  });

  it('tài khoản đã là Người ra đề từ trước: vẫn đánh dấu đã nhận, không đổi gì', async () => {
    const account = await existing();
    const { id, token } = await invite();
    await asAdmin('PUT', `/api/admin/users/${account.id}/role-tags/examiner`);
    expect((await accept(token, {}, account.cookie)).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('accepted');
  });

  it('tài khoản đã trở thành Quản trị viên sau khi được mời thì INVALID_STATE', async () => {
    const { id, token } = await invite();
    await seedUser({ username: 'qt2', email: EMAIL, isAdmin: true });
    const cookie = (await login(t.app, 'qt2', DEFAULT_PASSWORD)).cookie as string;
    const res = await accept(token, {}, cookie);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE' });
    expect(await statusOf(id)).toBe('pending');
  });
});
