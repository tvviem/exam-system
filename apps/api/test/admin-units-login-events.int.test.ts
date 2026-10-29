import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let adminCookie: string;
let adminId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  const admin = await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' });
  adminId = admin.id;
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
});

const as = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
  call(t.app, method, url, { cookie: adminCookie, body });

describe('Đơn vị', () => {
  it('thêm, sửa và xem danh sách theo mã; mỗi thao tác ghi nhật ký', async () => {
    const created = await as('POST', '/api/admin/units', { code: 'CNTT', name: 'Khoa CNTT' });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    await as('POST', '/api/admin/units', { code: 'KT', name: 'Khoa Kinh tế' });

    const updated = await as('PATCH', `/api/admin/units/${id}`, {
      name: 'Trường Công nghệ thông tin',
    });
    expect(updated.json()).toMatchObject({ id, code: 'CNTT', name: 'Trường Công nghệ thông tin' });

    const list = await as('GET', '/api/admin/units');
    expect(list.json().map((u: { code: string }) => u.code)).toEqual(['CNTT', 'KT']);

    const logs = (await as('GET', `/api/admin/audit-logs?entityId=${id}`)).json().items;
    expect(logs.map((l: { action: string }) => l.action)).toEqual(['unit.update', 'unit.create']);
    expect(logs[0]).toMatchObject({
      before: { name: 'Khoa CNTT' },
      after: { name: 'Trường Công nghệ thông tin' },
    });
  });

  it('trùng mã Đơn vị trả CONFLICT', async () => {
    await as('POST', '/api/admin/units', { code: 'CNTT', name: 'Khoa CNTT' });
    const res = await as('POST', '/api/admin/units', { code: 'CNTT', name: 'Khác' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'CONFLICT', field: 'code' });
  });

  it('Người ra đề không quản lý được Đơn vị', async () => {
    await seedUser({ username: 'gv', roleTags: ['examiner'] });
    const cookie = (await login(t.app, 'gv', DEFAULT_PASSWORD)).cookie;
    const res = await call(t.app, 'POST', '/api/admin/units', {
      cookie,
      body: { code: 'X', name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('lịch sử đăng nhập', () => {
  it('ghi cả lần thành công và thất bại; lọc theo người và kết quả', async () => {
    const user = await seedUser({ username: 'b2103456', fullName: 'Nguyễn Văn An' });
    await login(t.app, 'b2103456', 'sai-mat-khau-roi', '10.0.0.7');
    await login(t.app, 'b2103456', DEFAULT_PASSWORD, '10.0.0.7');
    await login(t.app, 'khong-co-ai', 'sai-mat-khau-roi');

    const mine = (await as('GET', `/api/admin/login-events?userId=${user.id}`)).json();
    expect(mine.total).toBe(2);
    expect(mine.items).toMatchObject([
      {
        userId: user.id,
        userName: 'Nguyễn Văn An',
        success: true,
        failureReason: null,
        ip: '10.0.0.7',
      },
      { userId: user.id, success: false, failureReason: 'INVALID_CREDENTIALS' },
    ]);

    const failed = (await as('GET', '/api/admin/login-events?success=false')).json();
    expect(failed.items.map((e: { identifierTried: string }) => e.identifierTried).sort()).toEqual([
      'b2103456',
      'khong-co-ai',
    ]);

    const all = (await as('GET', '/api/admin/login-events')).json();
    expect(all.items.filter((e: { userId: string }) => e.userId === adminId)).toHaveLength(1);
  });
});
