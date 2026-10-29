import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { days } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { seedUnit } from './support/units';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

let t: TestApp;
let admin: { id: string; cookie: string };
let unitId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  const user = await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' });
  admin = {
    id: user.id,
    cookie: (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string,
  };
  unitId = (await seedUnit('CNTT', 'Khoa CNTT')).id;
});

/** Kéo Clock rồi đăng nhập lại: phiên Quản trị viên chỉ sống 30 phút không hoạt động. */
const advance = async (ms: number) => {
  t.clock.advance(ms);
  admin.cookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
};
const as = (method: 'GET' | 'POST', url: string, body?: unknown) =>
  call(t.app, method, url, { cookie: admin.cookie, body });
const invite = (overrides: Record<string, unknown> = {}) =>
  as('POST', '/api/admin/invitations', {
    email: 'giang.vien@example.edu.vn',
    fullName: 'Lê Thị Giảng',
    unitId,
    ...overrides,
  });
const created = async (overrides: Record<string, unknown> = {}) => (await invite(overrides)).json();
const listOf = async (query = '') => (await as('GET', `/api/admin/invitations${query}`)).json();
const signedIn = async (input: SeedUser) => {
  const user = await seedUser(input);
  return {
    ...user,
    cookie: (await login(t.app, user.username as string, DEFAULT_PASSWORD)).cookie,
  };
};

describe('tạo và xem danh sách Lời mời', () => {
  it('chỉ Quản trị viên', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const res = await call(t.app, 'GET', '/api/admin/invitations', { cookie: examiner.cookie });
    expect(res.statusCode).toBe(403);
    expect((await call(t.app, 'GET', '/api/admin/invitations')).statusCode).toBe(401);
  });

  it('tạo trả token một lần, hạn 7 ngày; danh sách không lộ token', async () => {
    const res = await invite();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body).toMatchObject({
      email: 'giang.vien@example.edu.vn',
      fullName: 'Lê Thị Giảng',
      status: 'pending',
      expiresAt: new Date(t.clock.now().getTime() + days(7)).toISOString(),
    });

    const list = await listOf();
    expect(list).toMatchObject({
      total: 1,
      items: [{ id: body.id, unitName: 'Khoa CNTT', invitedByName: 'Quản Trị', status: 'pending' }],
    });
    expect(JSON.stringify(list)).not.toContain(body.token);
  });

  it('lọc theo trạng thái; hết hạn tính theo Clock', async () => {
    await created();
    await advance(days(8));
    await created({ email: 'khac@example.edu.vn' });
    expect((await listOf('?status=expired')).items.map((i: { email: string }) => i.email)).toEqual([
      'giang.vien@example.edu.vn',
    ]);
    expect((await listOf('?status=pending')).items.map((i: { email: string }) => i.email)).toEqual([
      'khac@example.edu.vn',
    ]);
  });

  it('nhật ký có invitation.create và không chứa token', async () => {
    const { id, token } = await created();
    const logs = (await as('GET', `/api/admin/audit-logs?entityId=${id}`)).json();
    expect(logs.items).toMatchObject([
      {
        action: 'invitation.create',
        entityType: 'invitation',
        actorName: 'Quản Trị',
        after: { email: 'giang.vien@example.edu.vn', fullName: 'Lê Thị Giảng', unitId },
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain(token);
  });
});

describe('từ chối khi tạo (Q79)', () => {
  it('email của Quản trị viên', async () => {
    await seedUser({ isAdmin: true, email: 'qt2@example.edu.vn' });
    const res = await invite({ email: 'qt2@example.edu.vn' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'email', code: 'email_belongs_to_admin' }],
    });
  });

  it('email của người đã là Người ra đề', async () => {
    await seedUser({ email: 'gv@example.edu.vn', roleTags: ['examiner'] });
    const res = await invite({ email: 'GV@example.edu.vn' });
    expect(res.json()).toMatchObject({ issues: [{ path: 'email', code: 'already_examiner' }] });
  });

  it('email đã có Lời mời còn hạn; hết hạn thì tạo mới được', async () => {
    await created();
    const again = await invite();
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ code: 'CONFLICT', field: 'email' });
    await advance(days(8));
    expect((await invite()).statusCode).toBe(201);
  });

  it('Đơn vị không tồn tại', async () => {
    const res = await invite({ unitId: '0198f0f0-0000-7000-8000-000000000000' });
    expect(res.json()).toMatchObject({ issues: [{ path: 'unitId', code: 'unit_not_found' }] });
  });

  it('email của tài khoản đã bị Xóa hoặc đang bị Khóa vẫn mời được; người dự thi cũng mời được', async () => {
    await seedUser({ email: 'da.xoa@example.edu.vn', removed: true });
    await seedUser({ email: 'bi.khoa@example.edu.vn', status: 'locked' });
    await seedUser({ email: 'sv@example.edu.vn', roleTags: ['candidate'] });
    for (const email of ['da.xoa', 'bi.khoa', 'sv']) {
      expect((await invite({ email: `${email}@example.edu.vn` })).statusCode).toBe(201);
    }
  });
});

describe('Thu hồi và Tạo lại link (Q80)', () => {
  it('Thu hồi: trạng thái revoked, ghi nhật ký; thu hồi lần hai bị từ chối', async () => {
    const { id } = await created();
    const res = await as('POST', `/api/admin/invitations/${id}/revoke`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, status: 'revoked' });
    expect((await as('POST', `/api/admin/invitations/${id}/revoke`)).json()).toMatchObject({
      code: 'INVALID_STATE',
    });
    const logs = (await as('GET', `/api/admin/audit-logs?entityId=${id}`)).json().items;
    expect(logs.map((l: { action: string }) => l.action)).toEqual([
      'invitation.revoke',
      'invitation.create',
    ]);
  });

  it('Tạo lại link: giữ id, token mới, hạn mới; cho cả Lời mời hết hạn', async () => {
    const first = await created();
    await advance(days(8));
    const res = await as('POST', `/api/admin/invitations/${first.id}/regenerate`);
    expect(res.statusCode).toBe(200);
    const again = res.json();
    expect(again).toMatchObject({
      id: first.id,
      status: 'pending',
      expiresAt: new Date(t.clock.now().getTime() + days(7)).toISOString(),
    });
    expect(again.token).not.toBe(first.token);
    expect((await call(t.app, 'GET', `/api/invitations/${first.token}`)).statusCode).toBe(404);
    expect((await call(t.app, 'GET', `/api/invitations/${again.token}`)).statusCode).toBe(200);
    expect((await listOf()).total).toBe(1);
    const logs = (await as('GET', `/api/admin/audit-logs?entityId=${first.id}`)).json();
    expect(logs.items[0].action).toBe('invitation.regenerate');
    expect(JSON.stringify(logs)).not.toContain(again.token);
  });

  it('Tạo lại link bị từ chối nếu email đó đã trở thành Người ra đề hoặc Quản trị viên trong lúc chờ', async () => {
    const first = await created({ email: 'a@example.edu.vn' });
    const second = await created({ email: 'b@example.edu.vn' });
    await advance(days(8));
    await seedUser({ email: 'a@example.edu.vn', roleTags: ['examiner'] });
    await seedUser({ email: 'b@example.edu.vn', isAdmin: true });
    for (const { id } of [first, second]) {
      const res = await as('POST', `/api/admin/invitations/${id}/regenerate`);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('đã thu hồi thì không Tạo lại link được; Lời mời khác nhận nhầm id trả NOT_FOUND', async () => {
    const { id } = await created();
    await as('POST', `/api/admin/invitations/${id}/revoke`);
    expect((await as('POST', `/api/admin/invitations/${id}/regenerate`)).json()).toMatchObject({
      code: 'INVALID_STATE',
    });
    const missing = '0198f0f0-0000-7000-8000-000000000000';
    expect((await as('POST', `/api/admin/invitations/${missing}/revoke`)).statusCode).toBe(404);
  });

  it('Tạo lại link bị từ chối nếu email đã có Lời mời khác còn hạn', async () => {
    const old = await created();
    await advance(days(8));
    await created();
    const res = await as('POST', `/api/admin/invitations/${old.id}/regenerate`);
    expect(res.json()).toEqual({ code: 'CONFLICT', field: 'email' });
  });
});
