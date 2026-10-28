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
