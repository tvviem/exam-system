import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { seedUnit } from './support/units';
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

describe('tìm và lọc Người dùng', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  const names = (res: { json(): { items: { fullName: string }[] } }) =>
    res
      .json()
      .items.map((u) => u.fullName)
      .sort();
  const list = (query: string) =>
    call(t.app, 'GET', `/api/admin/users?${query}`, { cookie: admin.cookie });

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    await seedUser({ fullName: 'Nguyễn Văn An', code: 'B2103456', roleTags: ['candidate'] });
    await seedUser({
      fullName: 'Trần Thị Bình',
      email: 'binh@example.edu.vn',
      roleTags: ['examiner'],
    });
    await seedUser({ fullName: 'Lê Văn Cường', status: 'locked', roleTags: ['candidate'] });
    await seedUser({ fullName: 'Phạm Đã Xóa', removed: true, roleTags: ['candidate'] });
  });

  it('tìm theo họ tên không dấu, không phân biệt hoa thường', async () => {
    expect(names(await list('q=NGUYEN'))).toEqual(['Nguyễn Văn An']);
  });

  it('tìm theo Mã định danh và email', async () => {
    expect(names(await list('q=b21034'))).toEqual(['Nguyễn Văn An']);
    expect(names(await list('q=binh@example'))).toEqual(['Trần Thị Bình']);
  });

  it('ký tự % trong từ khóa được hiểu theo nghĩa đen', async () => {
    expect(names(await list('q=%25'))).toEqual([]);
  });

  it('mặc định không hiện người đã bị Xóa; lọc "removed" thì chỉ hiện họ', async () => {
    expect(names(await list(''))).toEqual([
      'Lê Văn Cường',
      'Nguyễn Văn An',
      'Quản Trị',
      'Trần Thị Bình',
    ]);
    expect(names(await list('status=removed'))).toEqual(['Phạm Đã Xóa']);
  });

  it('lọc theo trạng thái và Nhãn vai trò', async () => {
    expect(names(await list('status=locked'))).toEqual(['Lê Văn Cường']);
    expect(names(await list('roleTag=candidate'))).toEqual(['Lê Văn Cường', 'Nguyễn Văn An']);
    expect(names(await list('roleTag=candidate&status=active'))).toEqual(['Nguyễn Văn An']);
  });

  it('phân trang trả đúng tổng và đúng trang', async () => {
    const res = await list('pageSize=3&page=2');
    expect(res.json()).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(res.json().items).toHaveLength(1);
  });

  it('pageSize quá 100 bị từ chối', async () => {
    expect((await list('pageSize=101')).statusCode).toBe(400);
  });
});

describe('xem và sửa Người dùng', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  const patch = (id: string, body: unknown) =>
    call(t.app, 'PATCH', `/api/admin/users/${id}`, { cookie: admin.cookie, body });
  const detail = (id: string) =>
    call(t.app, 'GET', `/api/admin/users/${id}`, { cookie: admin.cookie });
  const auditLogs = async (query = '') =>
    (await call(t.app, 'GET', `/api/admin/audit-logs?${query}`, { cookie: admin.cookie })).json();

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });

  it('chi tiết có ngày sinh, giới tính và Nhãn vai trò', async () => {
    const user = await seedUser({ fullName: 'Nguyễn Văn An', roleTags: ['candidate'] });
    const res = await detail(user.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: user.id,
      fullName: 'Nguyễn Văn An',
      dateOfBirth: null,
      gender: null,
      roleTags: ['candidate'],
      status: 'active',
      examinerProfile: null,
    });
  });

  it('không có người dùng thì trả 404', async () => {
    const res = await detail('01900000-0000-7000-8000-000000000000');
    expect(res.statusCode).toBe(404);
  });

  it('sửa thông tin và ghi nhật ký chỉ gồm trường thay đổi', async () => {
    const user = await seedUser({ fullName: 'Nguyễn Văn An', code: 'B2103456' });
    const res = await patch(user.id, {
      fullName: 'Nguyễn Văn Ân',
      code: 'B2103456',
      classLabel: 'DI21V7A1',
      dateOfBirth: '2003-05-17',
      gender: 'male',
    });
    expect(res.statusCode).toBe(200);
    expect((await detail(user.id)).json()).toMatchObject({
      fullName: 'Nguyễn Văn Ân',
      classLabel: 'DI21V7A1',
      dateOfBirth: '2003-05-17',
      gender: 'male',
    });

    const logs = await auditLogs(`entityId=${user.id}`);
    expect(logs.items).toHaveLength(1);
    expect(logs.items[0]).toMatchObject({
      actorId: admin.id,
      actorName: 'Quản Trị',
      action: 'user.update',
      entityType: 'user',
      entityId: user.id,
      before: { fullName: 'Nguyễn Văn An', classLabel: null, dateOfBirth: null, gender: null },
      after: {
        fullName: 'Nguyễn Văn Ân',
        classLabel: 'DI21V7A1',
        dateOfBirth: '2003-05-17',
        gender: 'male',
      },
    });
    expect(logs.items[0].before).not.toHaveProperty('code');
  });

  it('trùng email với người khác thì trả CONFLICT kèm tên trường', async () => {
    await seedUser({ email: 'an@example.edu.vn' });
    const user = await seedUser({});
    const res = await patch(user.id, { email: 'AN@example.edu.vn' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'CONFLICT', field: 'email' });
  });

  it('trùng với người đã bị Xóa thì vẫn được', async () => {
    await seedUser({ code: 'B2103456', removed: true });
    const user = await seedUser({});
    expect((await patch(user.id, { code: 'B2103456' })).statusCode).toBe(200);
  });

  it('không được bỏ trống cả tên đăng nhập lẫn email', async () => {
    const user = await seedUser({ username: 'an', email: null });
    const res = await patch(user.id, { username: null });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('tài khoản Quản trị viên chỉ sửa được họ tên, tên đăng nhập, email', async () => {
    const other = await seedUser({ isAdmin: true });
    expect((await patch(other.id, { fullName: 'Quản Trị Hai' })).statusCode).toBe(200);
    const res = await patch(other.id, { code: 'NV001' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('người đã bị Xóa không sửa được', async () => {
    const user = await seedUser({ removed: true });
    const res = await patch(user.id, { fullName: 'Tên Mới' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('sửa hồ sơ Người ra đề: học vị, học hàm, Đơn vị', async () => {
    const unit = await seedUnit('CNTT', 'Trường Công nghệ thông tin');
    const examiner = await seedUser({ roleTags: ['examiner'] });
    const res = await patch(examiner.id, {
      examinerProfile: { academicDegree: 'doctor', academicTitle: null, unitId: unit.id },
    });
    expect(res.statusCode).toBe(200);
    expect((await detail(examiner.id)).json().examinerProfile).toEqual({
      academicDegree: 'doctor',
      academicTitle: null,
      unitId: unit.id,
      unitName: 'Trường Công nghệ thông tin',
    });
  });

  it('người không mang nhãn Người ra đề thì không sửa được hồ sơ Người ra đề', async () => {
    const candidate = await seedUser({ roleTags: ['candidate'] });
    const res = await patch(candidate.id, { examinerProfile: { academicDegree: 'master' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('Khóa đăng nhập và Xóa người dùng', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  const post = (url: string, body?: unknown) =>
    call(t.app, 'POST', url, { cookie: admin.cookie, body });
  const auditActions = async (entityId: string) =>
    (
      await call(t.app, 'GET', `/api/admin/audit-logs?entityId=${entityId}`, {
        cookie: admin.cookie,
      })
    )
      .json()
      .items.map((i: { action: string }) => i.action);

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });

  it('Khóa đăng nhập thu hồi phiên ngay và chặn đăng nhập lại', async () => {
    const user = await signedIn({ roleTags: ['candidate'] });
    const res = await post(`/api/admin/users/${user.id}/lock`, { reason: 'Nghi lộ mật khẩu' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'locked', lockedReason: 'Nghi lộ mật khẩu' });

    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: user.cookie })).statusCode).toBe(
      401,
    );
    const again = await login(t.app, user.username as string, DEFAULT_PASSWORD);
    expect(again.res.json()).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(await auditActions(user.id)).toEqual(['user.lock']);
  });

  it('Khóa đăng nhập bắt buộc có lý do', async () => {
    const user = await seedUser({});
    expect((await post(`/api/admin/users/${user.id}/lock`, { reason: '  ' })).statusCode).toBe(400);
  });

  it('không tự Khóa hay tự Xóa chính mình', async () => {
    const lock = await post(`/api/admin/users/${admin.id}/lock`, { reason: 'thử' });
    expect(lock.statusCode).toBe(403);
    expect(lock.json()).toMatchObject({ code: 'CANNOT_TARGET_SELF' });
    const remove = await call(t.app, 'DELETE', `/api/admin/users/${admin.id}`, {
      cookie: admin.cookie,
    });
    expect(remove.json()).toMatchObject({ code: 'CANNOT_TARGET_SELF' });
  });

  it('Khóa được một Quản trị viên khác (Q62)', async () => {
    const other = await signedIn({ isAdmin: true });
    expect(
      (await post(`/api/admin/users/${other.id}/lock`, { reason: 'Nghỉ việc' })).statusCode,
    ).toBe(200);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: other.cookie })).statusCode).toBe(
      401,
    );
  });

  it('khóa người đang bị khóa, hoặc mở khóa người chưa bị khóa, trả INVALID_STATE', async () => {
    const locked = await seedUser({ status: 'locked' });
    const active = await seedUser({});
    const lockAgain = await post(`/api/admin/users/${locked.id}/lock`, { reason: 'lần hai' });
    expect(lockAgain.json()).toMatchObject({ code: 'INVALID_STATE' });
    const unlockActive = await post(`/api/admin/users/${active.id}/unlock`, {});
    expect(unlockActive.json()).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('mở khóa không bắt buộc lý do; mở xong đăng nhập lại được', async () => {
    const user = await seedUser({ status: 'locked' });
    const res = await post(`/api/admin/users/${user.id}/unlock`, {});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'active', lockedReason: null });
    expect((await login(t.app, user.username as string, DEFAULT_PASSWORD)).res.statusCode).toBe(
      200,
    );
    expect(await auditActions(user.id)).toEqual(['user.unlock']);
  });

  it('Xóa người dùng: thu hồi phiên, không đăng nhập được, ẩn khỏi danh sách mặc định', async () => {
    const user = await signedIn({ fullName: 'Người Bị Xóa', roleTags: ['candidate'] });
    const res = await call(t.app, 'DELETE', `/api/admin/users/${user.id}`, {
      cookie: admin.cookie,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'removed' });

    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: user.cookie })).statusCode).toBe(
      401,
    );
    const again = await login(t.app, user.username as string, DEFAULT_PASSWORD);
    expect(again.res.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const list = await call(t.app, 'GET', '/api/admin/users', { cookie: admin.cookie });
    expect(list.json().items.map((u: { fullName: string }) => u.fullName)).toEqual(['Quản Trị']);
    expect(await auditActions(user.id)).toEqual(['user.remove']);
  });

  it('người đã bị Xóa không Xóa lại hay Khóa được', async () => {
    const user = await seedUser({ removed: true });
    const remove = await call(t.app, 'DELETE', `/api/admin/users/${user.id}`, {
      cookie: admin.cookie,
    });
    expect(remove.json()).toMatchObject({ code: 'INVALID_STATE' });
    const lock = await post(`/api/admin/users/${user.id}/lock`, { reason: 'x' });
    expect(lock.json()).toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('Nhãn vai trò, mật khẩu tạm, Quản trị viên mới', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  const as = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
    call(t.app, method, url, { cookie: admin.cookie, body });
  const auditLogs = async (entityId: string) =>
    (await as('GET', `/api/admin/audit-logs?entityId=${entityId}`)).json().items;

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });

  it('gắn nhãn Người ra đề tạo hồ sơ trống; gỡ nhãn vẫn giữ hồ sơ (Q64)', async () => {
    const user = await signedIn({ roleTags: ['candidate'] });
    expect(
      (await as('PUT', `/api/admin/users/${user.id}/role-tags/examiner`)).json(),
    ).toMatchObject({
      roleTags: ['examiner', 'candidate'],
      examinerProfile: { academicDegree: null, academicTitle: null, unitId: null },
    });
    const removed = await as('DELETE', `/api/admin/users/${user.id}/role-tags/examiner`);
    expect(removed.json()).toMatchObject({
      roleTags: ['candidate'],
      examinerProfile: { unitId: null },
    });
    expect((await auditLogs(user.id)).map((l: { action: string }) => l.action)).toEqual([
      'user.role-tag.revoke',
      'user.role-tag.grant',
    ]);
  });

  it('gỡ nhãn có hiệu lực ngay với phiên đang mở; được phép không còn nhãn nào', async () => {
    const user = await signedIn({ roleTags: ['candidate'] });
    expect((await as('DELETE', `/api/admin/users/${user.id}/role-tags/candidate`)).statusCode).toBe(
      200,
    );
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: user.cookie });
    expect(me.json()).toMatchObject({ roleTags: [] });
  });

  it('gắn nhãn đã có thì không đổi gì và không ghi nhật ký', async () => {
    const user = await seedUser({ roleTags: ['candidate'] });
    expect((await as('PUT', `/api/admin/users/${user.id}/role-tags/candidate`)).statusCode).toBe(
      200,
    );
    expect(await auditLogs(user.id)).toEqual([]);
  });

  it('không gắn Nhãn vai trò cho tài khoản Quản trị viên (Q23)', async () => {
    const other = await seedUser({ isAdmin: true });
    const res = await as('PUT', `/api/admin/users/${other.id}/role-tags/examiner`);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('cấp lại mật khẩu tạm: hiển thị một lần, thu hồi phiên, gỡ khóa tạm, buộc đổi mật khẩu (Q61)', async () => {
    const user = await signedIn({ roleTags: ['candidate'] });
    for (let i = 0; i < 5; i++) await login(t.app, user.username as string, 'sai-mat-khau-roi');

    const res = await as('POST', `/api/admin/users/${user.id}/temporary-password`);
    expect(res.statusCode).toBe(200);
    const { temporaryPassword } = res.json();
    expect(temporaryPassword).toMatch(/^[a-zA-Z2-9]{10}$/);

    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: user.cookie })).statusCode).toBe(
      401,
    );
    expect((await login(t.app, user.username as string, DEFAULT_PASSWORD)).res.statusCode).toBe(
      401,
    );
    const fresh = await login(t.app, user.username as string, temporaryPassword);
    expect(fresh.res.statusCode).toBe(200);
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: fresh.cookie });
    expect(me.json()).toMatchObject({ mustChangePassword: true });

    const logs = await auditLogs(user.id);
    expect(logs.map((l: { action: string }) => l.action)).toEqual([
      'user.temporary-password.reissue',
    ]);
    expect(JSON.stringify(logs)).not.toContain(temporaryPassword);
  });

  it('không tự cấp lại mật khẩu tạm cho chính mình', async () => {
    const res = await as('POST', `/api/admin/users/${admin.id}/temporary-password`);
    expect(res.json()).toMatchObject({ code: 'CANNOT_TARGET_SELF' });
  });

  it('tạo Quản trị viên mới bằng mật khẩu tạm, không có Nhãn vai trò (Q23, Q70)', async () => {
    const res = await as('POST', '/api/admin/admins', {
      username: 'qt2',
      fullName: 'Quản Trị Hai',
    });
    expect(res.statusCode).toBe(201);
    const { id, temporaryPassword } = res.json();

    const fresh = await login(t.app, 'qt2', temporaryPassword);
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: fresh.cookie });
    expect(me.json()).toMatchObject({ isAdmin: true, roleTags: [], mustChangePassword: true });
    const logs = await auditLogs(id);
    expect(logs.map((l: { action: string }) => l.action)).toEqual(['admin.create']);
    expect(JSON.stringify(logs)).not.toContain(temporaryPassword);
  });

  it('tạo Quản trị viên trùng tên đăng nhập trả CONFLICT', async () => {
    await seedUser({ username: 'qt2' });
    const res = await as('POST', '/api/admin/admins', {
      username: 'QT2',
      fullName: 'Quản Trị Hai',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'CONFLICT', field: 'username' });
  });
});
