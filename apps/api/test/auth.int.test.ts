import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { days, hours, minutes } from './support/fake-clock';
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
beforeEach(resetState);

describe('đăng nhập', () => {
  it('đăng nhập bằng tên đăng nhập trả cookie phiên, /me trả thông tin người dùng', async () => {
    await seedUser({ username: 'b2103456', fullName: 'Trần Thị Bình', tags: ['candidate'] });

    const { res, cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(cookie).toBeDefined();

    const me = await call(t.app, 'GET', '/api/auth/me', { cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      fullName: 'Trần Thị Bình',
      isAdmin: false,
      tags: ['candidate'],
      mustChangePassword: false,
    });
  });

  it('cookie phiên có HttpOnly, SameSite=Lax và Path=/', async () => {
    await seedUser({ username: 'b2103456' });
    const { res } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const cookie = res.cookies.find((c) => c.name === 'exam_sid');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('đăng nhập bằng email, không phân biệt hoa thường', async () => {
    await seedUser({ username: null, email: 'binh.tran@example.edu.vn' });
    const { res } = await login(t.app, 'Binh.Tran@Example.edu.vn', DEFAULT_PASSWORD);
    expect(res.statusCode).toBe(200);
  });

  it('/me không có cookie trả 401', async () => {
    const me = await call(t.app, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(401);
  });
});

describe('đăng nhập thất bại', () => {
  it('sai mật khẩu và tài khoản không tồn tại trả cùng một lỗi chung', async () => {
    await seedUser({ username: 'b2103456' });
    const wrong = await login(t.app, 'b2103456', 'sai-mat-khau-roi');
    const unknown = await login(t.app, 'khong-co-ai', 'sai-mat-khau-roi');
    expect(wrong.res.statusCode).toBe(401);
    expect(wrong.res.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(unknown.res.statusCode).toBe(401);
    expect(unknown.res.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(wrong.cookie).toBeUndefined();
  });

  it('người dùng đã bị Xóa không đăng nhập được', async () => {
    await seedUser({ username: 'b2103456', removed: true });
    const { res } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect(res.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
  });

  it('bị Khóa đăng nhập: chỉ báo rõ khi mật khẩu đúng', async () => {
    await seedUser({ username: 'b2103456', status: 'locked' });
    const right = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect(right.res.statusCode).toBe(403);
    expect(right.res.json()).toEqual({ code: 'ACCOUNT_LOCKED' });
    const wrong = await login(t.app, 'b2103456', 'sai-mat-khau-roi');
    expect(wrong.res.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
  });

  it('thiếu trường bắt buộc trả 400', async () => {
    const res = await call(t.app, 'POST', '/api/auth/login', { body: { identifier: 'b2103456' } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('khóa tạm sau 5 lần sai liên tiếp (Q47)', () => {
  const failTimes = async (n: number) => {
    for (let i = 0; i < n; i++) await login(t.app, 'b2103456', 'sai-mat-khau-roi');
  };

  it('lần sai thứ 5 chặn đăng nhập 15 phút, kể cả khi nhập đúng mật khẩu', async () => {
    await seedUser({ username: 'b2103456' });
    await failTimes(5);
    const blocked = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.json()).toEqual({ code: 'LOGIN_TEMPORARILY_BLOCKED' });

    t.clock.advance(minutes(14));
    expect((await login(t.app, 'b2103456', DEFAULT_PASSWORD)).res.statusCode).toBe(429);

    t.clock.advance(minutes(1));
    expect((await login(t.app, 'b2103456', DEFAULT_PASSWORD)).res.statusCode).toBe(200);
  });

  it('đăng nhập đúng thì đếm lại từ đầu', async () => {
    await seedUser({ username: 'b2103456' });
    await failTimes(4);
    await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    await failTimes(4);
    expect((await login(t.app, 'b2103456', DEFAULT_PASSWORD)).res.statusCode).toBe(200);
  });

  it('hết thời gian chặn thì được thêm 5 lần thử', async () => {
    await seedUser({ username: 'b2103456' });
    await failTimes(5);
    t.clock.advance(minutes(15));
    await failTimes(4);
    expect((await login(t.app, 'b2103456', DEFAULT_PASSWORD)).res.statusCode).toBe(200);
  });
});

describe('đổi mật khẩu', () => {
  const NEW_PASSWORD = 'hoa-sen-no-sang';
  const change = (cookie: string | undefined, currentPassword: string, newPassword: string) =>
    call(t.app, 'POST', '/api/auth/change-password', {
      cookie,
      body: { currentPassword, newPassword },
    });

  it('đổi xong thì mật khẩu mới dùng được, mật khẩu cũ không còn dùng được', async () => {
    await seedUser({ username: 'b2103456', mustChangePassword: true });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie })).json().mustChangePassword).toBe(
      true,
    );

    expect((await change(cookie, DEFAULT_PASSWORD, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie })).json().mustChangePassword).toBe(
      false,
    );
    expect((await login(t.app, 'b2103456', NEW_PASSWORD)).res.statusCode).toBe(200);
    expect((await login(t.app, 'b2103456', DEFAULT_PASSWORD)).res.statusCode).toBe(401);
  });

  it('sai mật khẩu hiện tại trả 400', async () => {
    await seedUser({ username: 'b2103456' });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const res = await change(cookie, 'khong-phai-mat-khau', NEW_PASSWORD);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'WRONG_CURRENT_PASSWORD' });
  });

  it('mật khẩu mới vi phạm chính sách trả danh sách vi phạm', async () => {
    await seedUser({ username: 'b2103456' });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const res = await change(cookie, DEFAULT_PASSWORD, 'qwertyuiop');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'PASSWORD_POLICY', violations: ['common'] });
  });

  it('thu hồi các phiên khác, giữ phiên đang dùng', async () => {
    await seedUser({ username: 'b2103456' });
    const phone = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const laptop = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    await change(phone.cookie, DEFAULT_PASSWORD, NEW_PASSWORD);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: phone.cookie })).statusCode).toBe(
      200,
    );
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: laptop.cookie })).statusCode).toBe(
      401,
    );
  });
});

describe('mật khẩu tạm (Q48)', () => {
  it('quá hạn 7 ngày mà chưa đổi thì không đăng nhập được', async () => {
    await seedUser({
      username: 'b2103456',
      mustChangePassword: true,
      passwordExpiresAt: new Date(t.clock.now().getTime() - 1),
    });
    const { res } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ code: 'TEMPORARY_PASSWORD_EXPIRED' });
  });

  it('sau khi đổi mật khẩu thì không còn hạn 7 ngày', async () => {
    await seedUser({
      username: 'b2103456',
      mustChangePassword: true,
      passwordExpiresAt: new Date(t.clock.now().getTime() + days(7)),
    });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    await call(t.app, 'POST', '/api/auth/change-password', {
      cookie,
      body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'hoa-sen-no-sang' },
    });
    t.clock.advance(days(8));
    expect((await login(t.app, 'b2103456', 'hoa-sen-no-sang')).res.statusCode).toBe(200);
  });
});

describe('phiên đăng nhập (Q44, Q45, Q51)', () => {
  const me = (cookie?: string) => call(t.app, 'GET', '/api/auth/me', { cookie });

  it('đăng xuất thì cookie cũ không dùng được nữa', async () => {
    await seedUser({ username: 'b2103456' });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const res = await call(t.app, 'POST', '/api/auth/logout', { cookie });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((c) => c.name === 'exam_sid')?.value).toBe('');
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('Người dự thi: hết hạn sau 12 giờ không hoạt động', async () => {
    await seedUser({ username: 'b2103456', tags: ['candidate'] });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    t.clock.advance(hours(11));
    expect((await me(cookie)).statusCode).toBe(200);
    t.clock.advance(hours(11));
    expect((await me(cookie)).statusCode).toBe(200);
    t.clock.advance(hours(12));
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('Người dự thi: hoạt động liên tục vẫn hết hạn sau 7 ngày', async () => {
    await seedUser({ username: 'b2103456', tags: ['candidate'] });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    // 14 lần × 11 giờ 59 phút = 167 giờ 46 phút: chưa tới 7 ngày, chưa lần nào quá 12 giờ không hoạt động.
    for (let i = 0; i < 14; i++) {
      t.clock.advance(hours(12) - minutes(1));
      expect((await me(cookie)).statusCode).toBe(200);
    }
    t.clock.advance(hours(1));
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('Quản trị viên: hết hạn sau 30 phút không hoạt động', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const { cookie } = await login(t.app, 'quantri', DEFAULT_PASSWORD);
    t.clock.advance(minutes(29));
    expect((await me(cookie)).statusCode).toBe(200);
    t.clock.advance(minutes(30));
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('Quản trị viên: hoạt động liên tục vẫn hết hạn sau 12 giờ', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const { cookie } = await login(t.app, 'quantri', DEFAULT_PASSWORD);
    // 24 lần × 29 phút = 11 giờ 36 phút; thêm 29 phút là quá 12 giờ dù chưa quá 30 phút không hoạt động.
    for (let i = 0; i < 24; i++) {
      t.clock.advance(minutes(29));
      expect((await me(cookie)).statusCode).toBe(200);
    }
    t.clock.advance(minutes(29));
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('xem danh sách phiên đang mở, đánh dấu phiên hiện tại', async () => {
    await seedUser({ username: 'b2103456' });
    const phone = await login(t.app, 'b2103456', DEFAULT_PASSWORD, '10.0.0.7');
    t.clock.advance(minutes(5));
    await login(t.app, 'b2103456', DEFAULT_PASSWORD, '10.0.0.8');

    const res = await call(t.app, 'GET', '/api/auth/sessions', { cookie: phone.cookie });
    expect(res.statusCode).toBe(200);
    const sessions = res.json() as { ip: string; current: boolean }[];
    expect(sessions.map((s) => [s.ip, s.current])).toEqual([
      ['10.0.0.8', false],
      ['10.0.0.7', true],
    ]);
  });

  it('đăng xuất một phiên khác của chính mình', async () => {
    await seedUser({ username: 'b2103456' });
    const phone = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const laptop = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const list = (await call(t.app, 'GET', '/api/auth/sessions', { cookie: phone.cookie })).json();
    const laptopSession = list.find((s: { current: boolean }) => !s.current);

    const res = await call(t.app, 'DELETE', `/api/auth/sessions/${laptopSession.id}`, {
      cookie: phone.cookie,
    });
    expect(res.statusCode).toBe(200);
    expect((await me(laptop.cookie)).statusCode).toBe(401);
    expect((await me(phone.cookie)).statusCode).toBe(200);
  });

  it('không đăng xuất được phiên của người khác', async () => {
    await seedUser({ username: 'b2103456' });
    await seedUser({ username: 'b2103457' });
    const mine = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const other = await login(t.app, 'b2103457', DEFAULT_PASSWORD);
    const [otherSession] = (
      await call(t.app, 'GET', '/api/auth/sessions', { cookie: other.cookie })
    ).json();

    const res = await call(t.app, 'DELETE', `/api/auth/sessions/${otherSession.id}`, {
      cookie: mine.cookie,
    });
    expect(res.statusCode).toBe(404);
    expect((await me(other.cookie)).statusCode).toBe(200);
  });

  it('chưa đổi mật khẩu tạm thì chưa dùng được chức năng khác', async () => {
    await seedUser({ username: 'b2103456', mustChangePassword: true });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const res = await call(t.app, 'GET', '/api/auth/sessions', { cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'PASSWORD_CHANGE_REQUIRED' });
  });
});

describe('chống CSRF bằng header Origin', () => {
  it('request đổi dữ liệu thiếu Origin bị từ chối', async () => {
    await seedUser({ username: 'b2103456' });
    const res = await call(t.app, 'POST', '/api/auth/login', {
      origin: null,
      body: { identifier: 'b2103456', password: DEFAULT_PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'FORBIDDEN_ORIGIN' });
  });

  it('request đổi dữ liệu từ origin lạ bị từ chối, kể cả khi có cookie hợp lệ', async () => {
    await seedUser({ username: 'b2103456' });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    const res = await call(t.app, 'POST', '/api/auth/change-password', {
      cookie,
      origin: 'https://evil.example',
      body: { currentPassword: DEFAULT_PASSWORD, newPassword: 'hoa-sen-no-sang' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'FORBIDDEN_ORIGIN' });
  });

  it('request chỉ đọc không cần Origin', async () => {
    await seedUser({ username: 'b2103456' });
    const { cookie } = await login(t.app, 'b2103456', DEFAULT_PASSWORD);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie, origin: null })).statusCode).toBe(
      200,
    );
  });
});

describe('giới hạn tần suất đăng nhập', () => {
  it('mỗi IP được 20 lần trong 10 phút', async () => {
    for (let i = 0; i < 20; i++) {
      expect(
        (await login(t.app, `khong-co-${i}`, 'sai-mat-khau-roi', '10.0.0.9')).res.statusCode,
      ).toBe(401);
    }
    const limited = await login(t.app, 'khong-co-21', 'sai-mat-khau-roi', '10.0.0.9');
    expect(limited.res.statusCode).toBe(429);
    expect(limited.res.json()).toEqual({ code: 'RATE_LIMITED' });
    expect(
      (await login(t.app, 'khong-co-21', 'sai-mat-khau-roi', '10.0.0.10')).res.statusCode,
    ).toBe(401);

    t.clock.advance(minutes(10));
    expect((await login(t.app, 'khong-co-22', 'sai-mat-khau-roi', '10.0.0.9')).res.statusCode).toBe(
      401,
    );
  });

  it('mỗi định danh được 10 lần trong 10 phút, dù đổi IP', async () => {
    for (let i = 0; i < 10; i++) {
      await login(t.app, 'khong-co-ai', 'sai-mat-khau-roi', `10.0.1.${i}`);
    }
    const limited = await login(t.app, 'Khong-Co-Ai', 'sai-mat-khau-roi', '10.0.1.200');
    expect(limited.res.json()).toEqual({ code: 'RATE_LIMITED' });
  });
});
