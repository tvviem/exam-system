import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { days } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// Kịch bản "quên mật khẩu" trọn vẹn (PR 7a, docs/plan/slice-7.md Q371): tài khoản cá nhân của Người dự thi hoặc Người ra đề
// được tạo đã lâu, họ đã đổi mật khẩu từ lần đầu, rất lâu sau thì quên. Hệ thống không có email nên Quản trị viên dùng
// "Cấp lại mật khẩu tạm" (Q61). Các bài lẻ đã có ở admin-users, auth, session-reissue; file này ghép thành kịch bản đầu đến cuối.

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(resetState);

const PASSWORD_CU = 'mat-khau-da-doi-tu-lau';
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

async function admin(input: SeedUser = {}) {
  const user = await seedUser({ isAdmin: true, fullName: 'Quản Trị', ...input });
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}

const reissue = (cookie: string, userId: string) =>
  call(t.app, 'POST', `/api/admin/users/${userId}/temporary-password`, { cookie });

const actionsOf = async (userId: string) =>
  (
    await sql<{ action: string }>(
      'SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY id',
      [userId],
    )
  ).map((row) => row.action);

describe.each([
  ['Người dự thi', 'candidate'],
  ['Người ra đề', 'examiner'],
] as const)('%s quên mật khẩu đã đổi từ lâu', (_label, tag) => {
  it('Quản trị viên cấp lại, người đó dùng mật khẩu tạm rồi tự đặt mật khẩu mới', async () => {
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU });
    const username = user.username as string;

    // Tài khoản "cũ": nhiều tháng sau vẫn đăng nhập được bằng mật khẩu đã đổi (không có hạn 7 ngày của mật khẩu tạm).
    t.clock.advance(days(120));
    expect((await login(t.app, username, PASSWORD_CU)).res.statusCode).toBe(200);
    // Người đó quên: gõ sai không vào được. Họ nhờ Quản trị viên (đăng nhập hôm nay, vì phiên cũ đã hết hạn từ lâu).
    expect((await login(t.app, username, 'khong-nho-nua-roi')).res.statusCode).toBe(401);
    const qt = await admin();

    const res = await reissue(qt.cookie, user.id);
    expect(res.statusCode).toBe(200);
    const { temporaryPassword, passwordExpiresAt } = res.json();
    expect(new Date(passwordExpiresAt).getTime()).toBe(t.clock.now().getTime() + days(7));

    // Mật khẩu cũ mất hiệu lực; mật khẩu tạm đăng nhập được nhưng bị buộc đổi.
    expect((await login(t.app, username, PASSWORD_CU)).res.statusCode).toBe(401);
    const first = await login(t.app, username, temporaryPassword);
    expect(first.res.statusCode).toBe(200);
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: first.cookie });
    expect(me.json()).toMatchObject({ mustChangePassword: true });
    // Chưa đổi mật khẩu thì mọi chức năng khác bị chặn.
    const blocked = await call(t.app, 'GET', '/api/notifications', { cookie: first.cookie });
    expect(blocked.json()).toEqual({ code: 'PASSWORD_CHANGE_REQUIRED' });

    // Người đó tự đặt mật khẩu mới (Quản trị viên không biết mật khẩu này).
    const changed = await call(t.app, 'POST', '/api/auth/change-password', {
      cookie: first.cookie,
      body: { currentPassword: temporaryPassword, newPassword: PASSWORD_MOI },
    });
    expect(changed.statusCode).toBe(200);

    // Mật khẩu tạm không còn dùng được; mật khẩu mới dùng được; không còn buộc đổi; không còn hạn 7 ngày.
    expect((await login(t.app, username, temporaryPassword)).res.statusCode).toBe(401);
    t.clock.advance(days(30));
    const later = await login(t.app, username, PASSWORD_MOI);
    expect(later.res.statusCode).toBe(200);
    const meLater = await call(t.app, 'GET', '/api/auth/me', { cookie: later.cookie });
    expect(meLater.json()).toMatchObject({ mustChangePassword: false });
    expect(
      (await call(t.app, 'GET', '/api/notifications', { cookie: later.cookie })).statusCode,
    ).toBe(200);

    // Nhật ký ghi đủ hai việc, và không chỗ nào chứa mật khẩu.
    expect(await actionsOf(user.id)).toEqual([
      'user.temporary-password.reissue',
      'account.change-password',
    ]);
    const everything = JSON.stringify(
      await sql('SELECT before, after FROM audit_logs WHERE entity_id = $1', [user.id]),
    );
    for (const secret of [temporaryPassword, PASSWORD_MOI, PASSWORD_CU]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('phiên đăng nhập đang mở trên máy khác bị thu hồi ngay khi cấp lại', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU });
    const { cookie: oldSession } = await login(t.app, user.username as string, PASSWORD_CU);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: oldSession })).statusCode).toBe(200);

    await reissue(qt.cookie, user.id);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: oldSession })).statusCode).toBe(401);
  });

  it('mật khẩu tạm hết hạn sau 7 ngày chưa đổi thì Quản trị viên cấp lại lần hai', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU });
    const username = user.username as string;

    const { temporaryPassword: first } = (await reissue(qt.cookie, user.id)).json();
    t.clock.advance(days(8));
    const expired = await login(t.app, username, first);
    expect(expired.res.statusCode).toBe(401);
    expect(expired.res.json()).toEqual({ code: 'TEMPORARY_PASSWORD_EXPIRED' });

    // Phiên của Quản trị viên (tối đa 12 giờ) đã hết hạn sau 8 ngày: họ đăng nhập lại rồi mới cấp lại.
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: qt.cookie })).statusCode).toBe(401);
    const again = await login(t.app, qt.username as string, DEFAULT_PASSWORD);
    const { temporaryPassword: second } = (await reissue(again.cookie as string, user.id)).json();
    expect(second).not.toBe(first);
    expect((await login(t.app, username, first)).res.statusCode).toBe(401);
    expect((await login(t.app, username, second)).res.statusCode).toBe(200);
  });

  it('cấp lại hai lần liên tiếp thì chỉ mật khẩu tạm mới nhất dùng được', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU });
    const { temporaryPassword: first } = (await reissue(qt.cookie, user.id)).json();
    const { temporaryPassword: second } = (await reissue(qt.cookie, user.id)).json();
    expect((await login(t.app, user.username as string, first)).res.statusCode).toBe(401);
    expect((await login(t.app, user.username as string, second)).res.statusCode).toBe(200);
  });

  it('người đang bị Khóa đăng nhập: cấp lại mật khẩu tạm không mở khóa', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU, status: 'locked' });
    const { temporaryPassword } = (await reissue(qt.cookie, user.id)).json();
    const attempt = await login(t.app, user.username as string, temporaryPassword);
    expect(attempt.res.statusCode).toBe(403);
    expect(attempt.res.json()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
  });

  it('đổi mật khẩu mới bị từ chối nếu quá ngắn hoặc là mật khẩu phổ biến; vẫn bị buộc đổi', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], password: PASSWORD_CU });
    const { temporaryPassword } = (await reissue(qt.cookie, user.id)).json();
    const { cookie } = await login(t.app, user.username as string, temporaryPassword);
    for (const weak of ['ngan123', 'password123']) {
      const res = await call(t.app, 'POST', '/api/auth/change-password', {
        cookie,
        body: { currentPassword: temporaryPassword, newPassword: weak },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'PASSWORD_POLICY' });
    }
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie });
    expect(me.json()).toMatchObject({ mustChangePassword: true });
  });

  it('người dùng đã Xóa không được cấp lại mật khẩu tạm', async () => {
    const qt = await admin();
    const user = await seedUser({ roleTags: [tag], removed: true });
    const res = await reissue(qt.cookie, user.id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('Quản trị viên quên mật khẩu', () => {
  it('Quản trị viên thứ hai cấp lại; không tự cấp cho chính mình', async () => {
    const first = await admin({ username: 'qt1', password: PASSWORD_CU });
    const second = await admin({ username: 'qt2' });

    // Tự cấp cho mình bị từ chối (tránh tự chiếm quyền, Q61).
    const self = await reissue(second.cookie, second.id);
    expect(self.json()).toMatchObject({ code: 'CANNOT_TARGET_SELF' });

    const res = await reissue(second.cookie, first.id);
    expect(res.statusCode).toBe(200);
    const { temporaryPassword } = res.json();
    expect((await login(t.app, 'qt1', PASSWORD_CU)).res.statusCode).toBe(401);
    const fresh = await login(t.app, 'qt1', temporaryPassword);
    expect(fresh.res.statusCode).toBe(200);
    expect(
      (await call(t.app, 'GET', '/api/auth/me', { cookie: fresh.cookie })).json(),
    ).toMatchObject({ isAdmin: true, mustChangePassword: true });
    // Nhật ký ghi rõ ai cấp lại cho ai.
    const rows = await sql<{ actor_id: string; entity_id: string }>(
      "SELECT actor_id, entity_id FROM audit_logs WHERE action = 'user.temporary-password.reissue'",
    );
    expect(rows).toEqual([{ actor_id: second.id, entity_id: first.id }]);
  });

  it('chỉ Quản trị viên mới cấp lại được; Người ra đề và Người dự thi nhận 403', async () => {
    const target = await seedUser({ roleTags: ['candidate'] });
    for (const tag of ['examiner', 'candidate'] as const) {
      const other = await seedUser({ roleTags: [tag] });
      const { cookie } = await login(t.app, other.username as string, DEFAULT_PASSWORD);
      expect((await reissue(cookie as string, target.id)).statusCode).toBe(403);
    }
    expect(
      (await call(t.app, 'POST', `/api/admin/users/${target.id}/temporary-password`)).statusCode,
    ).toBe(401);
  });
});
