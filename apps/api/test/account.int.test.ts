import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
});

const cookieOf = async (username: string) =>
  (await login(t.app, username, DEFAULT_PASSWORD)).cookie as string;
const get = (cookie: string) => call(t.app, 'GET', '/api/account', { cookie });
const patch = (cookie: string, body: unknown) =>
  call(t.app, 'PATCH', '/api/account', { cookie, body });
const audit = (userId: string, action: string) =>
  sql<{ before: unknown; after: unknown; actor_id: string }>(
    'SELECT before, after, actor_id FROM audit_logs WHERE entity_id = $1 AND action = $2',
    [userId, action],
  );

async function seedExaminer() {
  const user = await seedUser({
    username: 'gv1',
    email: 'gv1@example.com',
    fullName: 'Trần Giảng Viên',
    code: 'GV001',
    roleTags: ['examiner'],
  });
  const [unit] = await sql<{ id: string }>(
    "INSERT INTO units (id, code, name) VALUES (gen_random_uuid(), 'KHTN', 'Khoa Khoa học tự nhiên') RETURNING id",
  );
  await sql(
    "INSERT INTO examiner_profiles (user_id, academic_degree, unit_id) VALUES ($1, 'master', $2)",
    [user.id, unit?.id],
  );
  return user;
}

describe('xem thông tin của mình', () => {
  it('chưa đăng nhập thì 401', async () => {
    expect((await call(t.app, 'GET', '/api/account')).statusCode).toBe(401);
  });

  it('Người ra đề thấy thông tin tài khoản, hồ sơ và tên Đơn vị, không lộ mật khẩu', async () => {
    await seedExaminer();
    const res = await get(await cookieOf('gv1'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      fullName: 'Trần Giảng Viên',
      username: 'gv1',
      email: 'gv1@example.com',
      code: 'GV001',
      isAdmin: false,
      roleTags: ['examiner'],
      editable: ['fullName', 'dateOfBirth', 'gender', 'academicDegree', 'academicTitle'],
      examinerProfile: {
        academicDegree: 'master',
        academicTitle: null,
        unitName: 'Khoa Khoa học tự nhiên',
      },
    });
    expect(res.body).not.toMatch(/password/i);
  });

  it('Người dự thi thấy Lớp và chỉ được sửa ngày sinh, giới tính', async () => {
    await seedUser({ username: 'sv1', code: 'SV001', roleTags: ['candidate'] });
    await sql("UPDATE users SET class_label = 'K65A' WHERE username = 'sv1'");
    const body = (await get(await cookieOf('sv1'))).json();
    expect(body).toMatchObject({ classLabel: 'K65A', examinerProfile: null });
    expect(body.editable).toEqual(['dateOfBirth', 'gender']);
  });

  it('Quản trị viên được sửa họ tên, ngày sinh, giới tính', async () => {
    await seedUser({ username: 'qt1', isAdmin: true });
    const body = (await get(await cookieOf('qt1'))).json();
    expect(body.editable).toEqual(['fullName', 'dateOfBirth', 'gender']);
  });
});

describe('tự sửa thông tin (Q133)', () => {
  it('Người ra đề sửa họ tên, ngày sinh, giới tính, học vị, học hàm; ghi nhật ký trước và sau', async () => {
    const user = await seedExaminer();
    const cookie = await cookieOf('gv1');
    const res = await patch(cookie, {
      fullName: '  Trần Văn Giảng  ',
      dateOfBirth: '1985-04-02',
      gender: 'male',
      academicDegree: 'doctor',
      academicTitle: 'associate_professor',
    });
    expect(res.statusCode, res.body).toBe(200);
    const read = (await get(cookie)).json();
    expect(read).toMatchObject({
      fullName: 'Trần Văn Giảng',
      dateOfBirth: '1985-04-02',
      gender: 'male',
      examinerProfile: { academicDegree: 'doctor', academicTitle: 'associate_professor' },
    });
    const [log] = await audit(user.id, 'account.update');
    expect(log?.actor_id).toBe(user.id);
    expect(log?.before).toMatchObject({ fullName: 'Trần Giảng Viên', academicDegree: 'master' });
    expect(log?.after).toMatchObject({ fullName: 'Trần Văn Giảng', academicDegree: 'doctor' });
  });

  it('xóa được ngày sinh và học hàm bằng null', async () => {
    await seedExaminer();
    const cookie = await cookieOf('gv1');
    await patch(cookie, { dateOfBirth: '1985-04-02', academicTitle: 'professor' });
    await patch(cookie, { dateOfBirth: null, academicTitle: null });
    const read = (await get(cookie)).json();
    expect(read.dateOfBirth).toBeNull();
    expect(read.examinerProfile.academicTitle).toBeNull();
  });

  it('Người dự thi sửa được ngày sinh và giới tính', async () => {
    await seedUser({ username: 'sv1', roleTags: ['candidate'] });
    const cookie = await cookieOf('sv1');
    expect((await patch(cookie, { dateOfBirth: '2005-09-01', gender: 'female' })).statusCode).toBe(
      200,
    );
    expect((await get(cookie)).json()).toMatchObject({
      dateOfBirth: '2005-09-01',
      gender: 'female',
    });
  });

  it.each([
    ['Người dự thi sửa họ tên', 'sv1', { fullName: 'Tên khác' }, 'fullName'],
    ['Người dự thi sửa học vị', 'sv1', { academicDegree: 'doctor' }, 'academicDegree'],
    ['sửa email', 'gv1', { email: 'khac@example.com' }, 'email'],
    ['sửa tên đăng nhập', 'gv1', { username: 'khac' }, 'username'],
    ['sửa mã định danh', 'gv1', { code: 'GV999' }, 'code'],
    ['sửa lớp', 'gv1', { classLabel: 'K1' }, 'classLabel'],
    ['sửa Đơn vị', 'gv1', { unitId: '0197a6f0-0000-7000-8000-000000000001' }, 'unitId'],
    ['Quản trị viên sửa học vị', 'qt1', { academicDegree: 'doctor' }, 'academicDegree'],
    ['gắn vai trò', 'gv1', { isAdmin: true }, 'isAdmin'],
  ])('từ chối: %s', async (_name, username, body, field) => {
    await seedExaminer();
    await seedUser({ username: 'sv1', roleTags: ['candidate'] });
    await seedUser({ username: 'qt1', isAdmin: true });
    const res = await patch(await cookieOf(username), body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: field, code: 'not_editable' }],
    });
  });

  it('họ tên rỗng hoặc ngày sinh sai định dạng thì 400, dữ liệu không đổi', async () => {
    await seedExaminer();
    const cookie = await cookieOf('gv1');
    expect((await patch(cookie, { fullName: '   ' })).statusCode).toBe(400);
    expect((await patch(cookie, { dateOfBirth: '02/04/1985' })).statusCode).toBe(400);
    expect((await get(cookie)).json().fullName).toBe('Trần Giảng Viên');
  });

  it('không có thay đổi thật thì không ghi nhật ký', async () => {
    const user = await seedExaminer();
    const cookie = await cookieOf('gv1');
    expect((await patch(cookie, { fullName: 'Trần Giảng Viên' })).statusCode).toBe(200);
    expect(await audit(user.id, 'account.update')).toHaveLength(0);
  });
});

describe('đổi mật khẩu (Q135, Q136)', () => {
  it('đổi thành công ghi nhật ký, không lưu mật khẩu; thu hồi phiên khác, giữ phiên này', async () => {
    const user = await seedUser({ username: 'gv1', roleTags: ['examiner'] });
    const here = await cookieOf('gv1');
    const other = await cookieOf('gv1');
    const res = await call(t.app, 'POST', '/api/auth/change-password', {
      cookie: here,
      body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'mot-mat-khau-moi-kha-dai' },
    });
    expect(res.statusCode).toBe(200);
    expect((await get(here)).statusCode).toBe(200);
    expect((await get(other)).statusCode).toBe(401);
    const logs = await audit(user.id, 'account.change-password');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain('mot-mat-khau-moi-kha-dai');
  });

  it('sai mật khẩu hiện tại thì không ghi nhật ký', async () => {
    const user = await seedUser({ username: 'gv1', roleTags: ['examiner'] });
    const res = await call(t.app, 'POST', '/api/auth/change-password', {
      cookie: await cookieOf('gv1'),
      body: { currentPassword: 'sai-mat-khau-hien-tai', newPassword: 'mot-mat-khau-moi-kha-dai' },
    });
    expect(res.statusCode).toBe(400);
    expect(await audit(user.id, 'account.change-password')).toHaveLength(0);
  });
});
