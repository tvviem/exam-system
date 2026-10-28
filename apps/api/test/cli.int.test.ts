import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/run-cli';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

const bootstrapEnv = {
  BOOTSTRAP_ADMIN_USERNAME: 'quantri',
  BOOTSTRAP_ADMIN_EMAIL: 'quantri@example.edu.vn',
  BOOTSTRAP_ADMIN_FULL_NAME: 'Quản trị hệ thống',
  BOOTSTRAP_ADMIN_PASSWORD: 'khoi-tao-lan-dau',
};

describe('pnpm cli bootstrap-admin', () => {
  beforeEach(resetState);

  it('tạo Quản trị viên đầu tiên', async () => {
    const result = await runCli(['bootstrap-admin'], bootstrapEnv);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('quantri');
  });

  it('từ chối khi đã có Quản trị viên', async () => {
    await runCli(['bootstrap-admin'], bootstrapEnv);
    const second = await runCli(['bootstrap-admin'], {
      ...bootstrapEnv,
      BOOTSTRAP_ADMIN_USERNAME: 'khac',
    });
    expect(second.exitCode).toBe(1);
    expect(second.output).toContain('Đã có Quản trị viên');
  });

  it('báo thiếu biến môi trường', async () => {
    const result = await runCli(['bootstrap-admin'], { BOOTSTRAP_ADMIN_USERNAME: 'quantri' });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('BOOTSTRAP_ADMIN_FULL_NAME');
  });

  it('từ chối mật khẩu khởi tạo vi phạm chính sách mật khẩu', async () => {
    const result = await runCli(['bootstrap-admin'], {
      ...bootstrapEnv,
      BOOTSTRAP_ADMIN_PASSWORD: 'ngan',
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('too_short');
  });
});

describe('pnpm cli recover-admin', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(resetState);

  const temporaryPasswordIn = (output: string) => /Mật khẩu tạm: (\S+)/.exec(output)?.[1];

  it('mở Khóa đăng nhập, cấp mật khẩu tạm mới và thu hồi phiên cũ', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const old = await login(t.app, 'quantri', DEFAULT_PASSWORD);
    await seedUser({ username: 'quantri2', isAdmin: true, status: 'locked' });

    const result = await runCli(
      ['recover-admin', '--username', 'quantri2'],
      {},
      { clock: t.clock },
    );
    expect(result.exitCode).toBe(0);
    const temporary = temporaryPasswordIn(result.output);
    expect(temporary).toHaveLength(10);

    const { res, cookie } = await login(t.app, 'quantri2', temporary as string);
    expect(res.statusCode).toBe(200);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie })).json().mustChangePassword).toBe(
      true,
    );
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: old.cookie })).statusCode).toBe(200);
  });

  it('phiên đang mở của tài khoản được khôi phục bị thu hồi', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const old = await login(t.app, 'quantri', DEFAULT_PASSWORD);
    await runCli(['recover-admin', '--username', 'quantri'], {}, { clock: t.clock });
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: old.cookie })).statusCode).toBe(401);
  });

  it('mật khẩu tạm hết hạn sau 7 ngày', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const result = await runCli(['recover-admin', '--username', 'quantri'], {}, { clock: t.clock });
    t.clock.advance(7 * 24 * 60 * 60 * 1000);
    const { res } = await login(t.app, 'quantri', temporaryPasswordIn(result.output) as string);
    expect(res.json()).toEqual({ code: 'TEMPORARY_PASSWORD_EXPIRED' });
  });

  it('không áp dụng cho tài khoản không phải Quản trị viên (Q23)', async () => {
    await seedUser({ username: 'gv.an', tags: ['examiner'] });
    const result = await runCli(['recover-admin', '--username', 'gv.an'], {});
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('không phải tài khoản Quản trị viên');
  });

  it('báo lỗi khi không tìm thấy tên đăng nhập hoặc thiếu --username', async () => {
    expect((await runCli(['recover-admin', '--username', 'khong-co'], {})).exitCode).toBe(1);
    const missing = await runCli(['recover-admin'], {});
    expect(missing.exitCode).toBe(1);
    expect(missing.output).toContain('--username');
  });
});
