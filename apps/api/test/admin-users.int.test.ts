import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(resetState);

/** Tạo một người dùng và đăng nhập; trả cookie phiên. */
async function signedIn(input: SeedUser = {}) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}

describe('chỉ Quản trị viên', () => {
  it('Người ra đề gọi API quản trị nhận 403', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const res = await call(t.app, 'GET', '/api/admin/users', { cookie: examiner.cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('chưa đăng nhập nhận 401', async () => {
    const res = await call(t.app, 'GET', '/api/admin/users');
    expect(res.statusCode).toBe(401);
  });

  it('Quản trị viên xem được danh sách Người dùng', async () => {
    const admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    const res = await call(t.app, 'GET', '/api/admin/users', { cookie: admin.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [{ id: admin.id, fullName: 'Quản Trị', isAdmin: true, status: 'active' }],
    });
  });
});
