import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7c-2a, lát 8 (docs/plan/slice-7c2-thiet-ke-kiem-thu.md K10): Quản trị viên tạo Quản trị viên khác bằng EMAIL.
// Tài khoản mới ở "Chờ kích hoạt" (không mật khẩu), nhận thư kích hoạt làn khẩn; không còn đường đặt mật khẩu ban đầu.

let t: TestApp;
let admin: { id: string; cookie: string };
const NEW_PASSWORD = 'hoa-sen-no-sang-moi-2026';
const EMAIL = 'quan.tri.hai@example.edu.vn';

beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
  const user = await seedUser({ isAdmin: true, fullName: 'Quản Trị' });
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  admin = { id: user.id, cookie: cookie as string };
});

const createAdmin = (body: Record<string, unknown>) =>
  call(t.app, 'POST', '/api/admin/admins', { cookie: admin.cookie, body });

function linkIn(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  const url = new URL(urls[0] as string);
  return { path: url.pathname, token: url.hash.slice(1) };
}

describe('Quản trị viên tạo Quản trị viên bằng email (K10)', () => {
  it('B-29: email bắt buộc và phải đúng định dạng; không tạo gì, không gửi thư', async () => {
    // Có tên đăng nhập hợp lệ để lỗi chỉ có thể do email.
    const base = { fullName: 'Quản Trị Hai', username: 'qt2' };
    expect((await createAdmin(base)).statusCode).toBe(400);
    expect((await createAdmin({ ...base, email: null })).statusCode).toBe(400);
    expect((await createAdmin({ ...base, email: 'khong-phai' })).statusCode).toBe(400);
    expect(await sql('SELECT 1 FROM users WHERE is_admin AND id <> $1', [admin.id])).toHaveLength(
      0,
    );
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
  });

  it('B-30: tạo xong ở Chờ kích hoạt, không mật khẩu; phản hồi không có mật khẩu; nhận thư kích hoạt làn khẩn', async () => {
    const res = await createAdmin({ fullName: 'Quản Trị Hai', email: EMAIL });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toEqual({ id: expect.any(String), username: EMAIL });
    expect(JSON.stringify(body)).not.toMatch(/password/i);

    const [user] = await sql<Record<string, unknown>>(
      'SELECT is_admin, password_hash, activated_at, email, username, created_by FROM users WHERE id = $1',
      [body.id],
    );
    expect(user).toEqual({
      is_admin: true,
      password_hash: null,
      activated_at: null,
      email: EMAIL,
      username: EMAIL,
      created_by: admin.id,
    });
    const rows = await sql<{ kind: string; lane: string; requested_by: string; user_id: string }>(
      'SELECT kind, lane, requested_by, user_id FROM email_outbox',
    );
    expect(rows).toEqual([
      { kind: 'activation', lane: 'urgent', requested_by: admin.id, user_id: body.id },
    ]);
    await t.queue.drain();
    expect(t.mail.sent.map((m) => m.to)).toEqual([EMAIL]);
  });

  it('B-30b: tên đăng nhập tùy chọn; nếu có thì dùng đúng tên đó', async () => {
    const res = await createAdmin({
      fullName: 'Quản Trị Ba',
      email: 'ba@example.edu.vn',
      username: 'qt3',
    });
    expect(res.json().username).toBe('qt3');
  });

  it('B-31: Quản trị viên mới kích hoạt bằng liên kết trong thư rồi đăng nhập; email đã xác thực; không còn đường đặt mật khẩu ban đầu', async () => {
    const created = (await createAdmin({ fullName: 'Quản Trị Hai', email: EMAIL })).json();
    await t.queue.drain();
    const link = linkIn(t.mail.sent[0]?.text as string);
    expect(link.path).toBe('/activate');

    // Chưa kích hoạt thì không đăng nhập được bằng bất kỳ mật khẩu nào.
    expect((await login(t.app, EMAIL, NEW_PASSWORD)).res.statusCode).not.toBe(200);

    const consumed = await call(t.app, 'POST', '/api/auth/links/consume', {
      body: { purpose: 'activation', token: link.token, newPassword: NEW_PASSWORD },
    });
    expect(consumed.json().state).toBe('ok');
    const fresh = await login(t.app, EMAIL, NEW_PASSWORD);
    expect(fresh.res.statusCode).toBe(200);
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: fresh.cookie });
    expect(me.json()).toMatchObject({ isAdmin: true, roleTags: [], mustChangePassword: false });
    const [user] = await sql<{ email_verified_at: Date | null }>(
      'SELECT email_verified_at FROM users WHERE id = $1',
      [created.id],
    );
    expect(user?.email_verified_at).not.toBeNull();
  });

  it('B-31b: trùng email hoặc tên đăng nhập trả CONFLICT, không tạo gì, không gửi thư', async () => {
    await seedUser({ username: 'da-co', email: EMAIL });
    const byEmail = await createAdmin({ fullName: 'Quản Trị Hai', email: EMAIL });
    expect(byEmail.statusCode).toBe(409);
    expect(byEmail.json()).toEqual({ code: 'CONFLICT', field: 'email' });
    const byName = await createAdmin({
      fullName: 'Quản Trị Hai',
      email: 'moi@example.edu.vn',
      username: 'DA-CO',
    });
    expect(byName.statusCode).toBe(409);
    expect(byName.json()).toEqual({ code: 'CONFLICT', field: 'username' });
    expect(await sql('SELECT 1 FROM email_outbox')).toHaveLength(0);
  });

  it('B-31c: nhật ký admin.create có email nhưng không có mã, liên kết hay mật khẩu', async () => {
    const created = (await createAdmin({ fullName: 'Quản Trị Hai', email: EMAIL })).json();
    await t.queue.drain();
    const link = linkIn(t.mail.sent[0]?.text as string);
    const logs = (
      await call(t.app, 'GET', `/api/admin/audit-logs?entityId=${created.id}`, {
        cookie: admin.cookie,
      })
    ).json().items;
    expect(logs.map((l: { action: string }) => l.action)).toEqual(['admin.create']);
    expect(JSON.stringify(logs)).not.toContain(link.token);
    expect(JSON.stringify(logs)).not.toMatch(/password|activate/i);
    expect(logs[0].after).toMatchObject({ email: EMAIL, fullName: 'Quản Trị Hai' });
  });

  it('chỉ Quản trị viên tạo được', async () => {
    const examiner = await seedUser({ roleTags: ['examiner'] });
    const { cookie } = await login(t.app, examiner.username as string, DEFAULT_PASSWORD);
    const res = await call(t.app, 'POST', '/api/admin/admins', {
      cookie: cookie as string,
      body: { fullName: 'X', email: 'x@example.edu.vn' },
    });
    expect(res.statusCode).toBe(403);
  });
});
