import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthLinks } from '../src/modules/identity/auth-links/auth-links.service';
import { createTestApp, type TestApp } from './support/app';
import { captureLogs } from './support/capture-logs';
import { sql } from './support/db';
import { minutes, seconds } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7c-1, K3: API công khai quên mật khẩu, xem và dùng Liên kết một lần (docs/plan/slice-7c-thiet-ke-kiem-thu.md lát 6).
// Dùng bộ dựng thư thật; thư đọc từ vận chuyển giả.

let t: TestApp;
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
});

const forgot = (
  identifier: string,
  options: { ip?: string; headers?: Record<string, string> } = {},
) => call(t.app, 'POST', '/api/auth/forgot-password', { body: { identifier }, ...options });

const consume = (
  purpose: string,
  token: string,
  newPassword: string,
  headers?: Record<string, string>,
) =>
  call(t.app, 'POST', '/api/auth/links/consume', {
    body: { purpose, token, newPassword },
    headers,
  });

/** Mã trong liên kết duy nhất của thư (mảnh sau dấu #). */
function tokenIn(text: string): string {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  return new URL(urls[0] as string).hash.slice(1);
}

const verified = (extra: Parameters<typeof seedUser>[0] = {}) =>
  seedUser({ roleTags: ['candidate'], emailVerified: true, ...extra });

describe('quên mật khẩu (K3, TC 2, 7, 10)', () => {
  it('A-16: tài khoản Hoạt động có email đã xác thực nhận thư đặt lại; dùng liên kết trong thư đặt được mật khẩu mới', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    const res = await forgot('hoat-dong');
    expect(res.statusCode).toBe(200);
    await t.queue.drain();

    expect(t.mail.sent.map((m) => m.to)).toEqual(['hd@example.com']);
    expect(t.mail.sent[0]?.subject).toContain('Đặt lại mật khẩu');
    const token = tokenIn(t.mail.sent[0]?.text as string);

    expect((await consume('password_reset', token, PASSWORD_MOI)).statusCode).toBe(200);
    expect((await login(t.app, 'hoat-dong', PASSWORD_MOI)).res.statusCode).toBe(200);
    expect((await login(t.app, 'hoat-dong', DEFAULT_PASSWORD)).res.statusCode).toBe(401);
  });

  it('A-16b: nhập email thay cho tên đăng nhập cũng được', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    await forgot('hd@example.com');
    await t.queue.drain();
    expect(t.mail.sent.map((m) => m.to)).toEqual(['hd@example.com']);
  });

  it('A-17: cùng một câu trả lời, mã trạng thái và thân phản hồi cho mọi trường hợp (có, không có, Khóa, Chờ kích hoạt, email chưa xác thực, đã Xóa)', async () => {
    await verified({ username: 'u-ok', email: 'ok@example.com' });
    await verified({ username: 'u-locked', email: 'locked@example.com', status: 'locked' });
    await seedUser({
      roleTags: ['candidate'],
      username: 'u-pending',
      email: 'pending@example.com',
      pending: true,
    });
    await seedUser({
      roleTags: ['candidate'],
      username: 'u-unverified',
      email: 'unverified@example.com',
    });
    await verified({ username: 'u-removed', email: 'removed@example.com', removed: true });

    const responses = [];
    for (const identifier of [
      'u-ok',
      'khong-co-nguoi-nay',
      'u-locked',
      'u-pending',
      'u-unverified',
      'u-removed',
    ]) {
      const res = await forgot(identifier);
      responses.push({ status: res.statusCode, body: res.json() });
    }
    expect(new Set(responses.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(responses[0]).toEqual({ status: 200, body: { ok: true } });
  });

  it('A-18, A-19: chỉ người đủ điều kiện nhận thư: Hoạt động nhận thư đặt lại, Chờ kích hoạt nhận thư KÍCH HOẠT; Khóa, Xóa, email chưa xác thực không nhận gì', async () => {
    await verified({ username: 'u-ok', email: 'ok@example.com' });
    await verified({ username: 'u-locked', email: 'locked@example.com', status: 'locked' });
    await seedUser({
      roleTags: ['candidate'],
      username: 'u-pending',
      email: 'pending@example.com',
      pending: true,
    });
    await seedUser({
      roleTags: ['candidate'],
      username: 'u-unverified',
      email: 'unverified@example.com',
    });
    await verified({ username: 'u-removed', email: 'removed@example.com', removed: true });
    await verified({ username: 'u-noemail', email: null });

    for (const identifier of [
      'u-ok',
      'u-locked',
      'u-pending',
      'u-unverified',
      'u-removed',
      'u-noemail',
      'khong-co',
    ]) {
      await forgot(identifier);
    }
    await t.queue.drain();

    const bySubject = Object.fromEntries(t.mail.sent.map((m) => [m.to, m.subject]));
    expect(Object.keys(bySubject).sort()).toEqual(['ok@example.com', 'pending@example.com']);
    expect(bySubject['ok@example.com']).toContain('Đặt lại mật khẩu');
    expect(bySubject['pending@example.com']).toContain('Kích hoạt tài khoản');
  });

  it('A-20: đặt lại xong thì gửi thư báo "mật khẩu đã đổi" ghi giờ, trình duyệt, hệ điều hành, không có IP và không có mật khẩu', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    await forgot('hoat-dong');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);
    t.mail.reset();

    await consume('password_reset', token, PASSWORD_MOI, { 'user-agent': CHROME_WINDOWS });
    await t.queue.drain();

    expect(t.mail.sent).toHaveLength(1);
    const notice = t.mail.sent[0];
    expect(notice?.to).toBe('hd@example.com');
    expect(notice?.subject).toContain('đã được đổi');
    expect(notice?.text).toContain('Chrome 130');
    expect(notice?.text).toContain('Windows');
    expect(notice?.text).not.toContain(PASSWORD_MOI);
    expect(notice?.text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // không địa chỉ IP
  });
});

describe('giới hạn tần suất và thời gian phản hồi (K4, TC 7)', () => {
  it('A-21: tối đa 3 yêu cầu mỗi giờ cho một tên đăng nhập; yêu cầu thứ 4 vẫn nhận cùng câu trả lời nhưng không thêm thư', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    const bodies = [];
    for (let i = 0; i < 4; i++) {
      const res = await forgot('hoat-dong');
      bodies.push({ status: res.statusCode, body: res.json() });
      t.clock.advance(seconds(61)); // đủ giãn cách 60 giây để chỉ thử riêng mức 3 mỗi giờ
    }
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(3);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);

    // Qua cửa sổ một giờ thì được yêu cầu lại.
    t.clock.advance(minutes(60));
    await forgot('hoat-dong');
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(4);
  });

  it('A-22: tối đa 20 yêu cầu mỗi giờ từ một IP, tính cả yêu cầu cho tài khoản không có thật', async () => {
    for (let i = 0; i < 21; i++)
      await verified({ username: `sv${i}`, email: `sv${i}@example.com` });
    for (let i = 0; i < 5; i++) await forgot(`khong-co-${i}`, { ip: '198.51.100.7' });
    for (let i = 0; i < 21; i++) await forgot(`sv${i}`, { ip: '198.51.100.7' });
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(15); // 20 lượt của IP trừ 5 lượt đã dùng cho tên không có thật
    // IP khác không bị ảnh hưởng.
    await forgot('sv20', { ip: '198.51.100.8' });
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(16);
  });

  it('A-23: hai yêu cầu cho cùng một tên cách nhau dưới 60 giây thì chỉ một thư; đủ 60 giây thì được thêm', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    await forgot('hoat-dong');
    t.clock.advance(seconds(59));
    await forgot('hoat-dong');
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(1);

    t.clock.advance(seconds(1));
    await forgot('hoat-dong');
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(2);
  });

  it('A-23b: tên đăng nhập hay email viết hoa thường khác nhau vẫn tính là một định danh', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    await forgot('hoat-dong');
    t.clock.advance(seconds(10));
    await forgot('HOAT-DONG');
    await forgot('HD@Example.com');
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(1);
  });

  it('A-24: thời gian phản hồi của tài khoản có thật và không có thật chênh nhau dưới 20 ms ở trung vị (không dò được tài khoản qua thời gian)', async () => {
    const real: number[] = [];
    const fake: number[] = [];
    for (let i = 0; i < 15; i++) {
      await verified({ username: `that${i}`, email: `that${i}@example.com` });
      let started = performance.now();
      await forgot(`that${i}`);
      real.push(performance.now() - started);
      started = performance.now();
      await forgot(`gia${i}`);
      fake.push(performance.now() - started);
    }
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    expect(Math.abs(median(real) - median(fake))).toBeLessThan(20);
  });
});

describe('Chờ kích hoạt không lộ trạng thái (K7)', () => {
  it('A-25: tài khoản Chờ kích hoạt đăng nhập (đúng hay sai mật khẩu) nhận đúng câu trả lời như tên không tồn tại', async () => {
    await seedUser({
      roleTags: ['candidate'],
      username: 'cho-kich-hoat',
      email: 'ck@example.com',
      pending: true,
    });
    const pending = await login(t.app, 'cho-kich-hoat', PASSWORD_MOI);
    const missing = await login(t.app, 'khong-ton-tai', PASSWORD_MOI);
    expect(pending.res.statusCode).toBe(401);
    expect(pending.res.statusCode).toBe(missing.res.statusCode);
    expect(pending.res.json()).toEqual(missing.res.json());
  });
});

describe('bất biến bảo mật của cả luồng (K5, TC 3)', () => {
  it('A-27: quét log, nhật ký, auth_tokens và hàng đợi thư sau một luồng đầy đủ: mã và mật khẩu chỉ nằm trong thư', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    let token = '';
    const logs = await captureLogs(async () => {
      await forgot('hoat-dong');
      await t.queue.drain();
      token = tokenIn(t.mail.sent[0]?.text as string);
      await consume('password_reset', token, PASSWORD_MOI, { 'user-agent': CHROME_WINDOWS });
      await consume('password_reset', token, 'mat-khau-lan-hai-khac', {
        'user-agent': CHROME_WINDOWS,
      });
      await consume('password_reset', 'ma-gia-0123456789abcdefghijklmnopqrstuv', PASSWORD_MOI);
      await t.queue.drain();
    });

    const secrets = [token, PASSWORD_MOI, 'mat-khau-lan-hai-khac'];
    const dumps = [
      logs.join('\n'),
      JSON.stringify(await sql('SELECT * FROM audit_logs')),
      JSON.stringify(await sql('SELECT * FROM auth_tokens')),
      JSON.stringify(await sql('SELECT * FROM email_outbox')),
      JSON.stringify(await sql('SELECT * FROM login_events')),
    ];
    for (const dump of dumps) for (const secret of secrets) expect(dump).not.toContain(secret);
    // Phép quét có nội dung để quét: thư thật sự đã mang mã.
    expect(t.mail.sent.some((m) => m.text.includes(token))).toBe(true);
    expect(logs.join('\n')).not.toMatch(/hd@example\.com/); // không địa chỉ email đầy đủ trong log
  });
});

describe('xem và dùng liên kết qua HTTP (K3, TC 14, 17)', () => {
  const status = (purpose: string, token: string) =>
    call(t.app, 'POST', '/api/auth/links/status', { body: { purpose, token } });
  const issue = async (extra: Parameters<typeof seedUser>[0] = {}) => {
    const user = await seedUser({
      roleTags: ['candidate'],
      username: 'cho-kich-hoat',
      email: 'ck@example.com',
      pending: true,
      ...extra,
    });
    return { user, ...(await t.app.get(AuthLinks).issue(user.id, 'activation')) };
  };

  it('H-A: status trả từng trạng thái kèm giờ liên quan; mã lạ chỉ trả unknown', async () => {
    const { token, expiresAt } = await issue();
    expect((await status('activation', token)).json()).toEqual({
      state: 'ok',
      expiresAt: expiresAt.toISOString(),
    });

    expect((await status('activation', 'ma-la-0123456789abcdefghijklmnopqrstuvwx')).json()).toEqual(
      { state: 'unknown' },
    );

    t.clock.advance(7 * 24 * 3_600_000);
    expect((await status('activation', token)).json()).toEqual({
      state: 'expired',
      expiredAt: expiresAt.toISOString(),
    });
  });

  it('H-B: consume với mật khẩu yếu trả 400 PASSWORD_POLICY kèm lý do và không tiêu mã', async () => {
    const { token } = await issue();
    const weak = await consume('activation', token, 'ngan123');
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ code: 'PASSWORD_POLICY', violations: ['too_short'] });
    expect((await status('activation', token)).json()).toMatchObject({ state: 'ok' });
    expect((await consume('activation', token, PASSWORD_MOI)).json()).toEqual({ state: 'ok' });
    expect((await consume('activation', token, PASSWORD_MOI)).json()).toMatchObject({
      state: 'used',
    });
  });

  it('H-C: loại liên kết lạ hoặc thiếu trường bị từ chối bằng 400, không làm hỏng máy chủ', async () => {
    expect((await status('support_link', 'x')).statusCode).toBe(400); // chưa mở cho người dùng tự gọi
    expect(
      (await call(t.app, 'POST', '/api/auth/links/consume', { body: { purpose: 'activation' } }))
        .statusCode,
    ).toBe(400);
    expect((await call(t.app, 'POST', '/api/auth/forgot-password', { body: {} })).statusCode).toBe(
      400,
    );
  });

  it('H-D: yêu cầu từ nguồn lạ (CSRF) bị chặn như mọi API đổi dữ liệu', async () => {
    const res = await call(t.app, 'POST', '/api/auth/forgot-password', {
      body: { identifier: 'a' },
      origin: 'https://ke-xau.example',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('hiệu năng (AGENTS.md)', () => {
  it('H-01, H-02: forgot-password, status và consume (có băm Argon2) đều dưới 300 ms', async () => {
    await verified({ username: 'hoat-dong', email: 'hd@example.com' });
    let started = performance.now();
    await forgot('hoat-dong');
    expect(performance.now() - started).toBeLessThan(100);

    const user = await seedUser({
      roleTags: ['candidate'],
      username: 'moi',
      email: 'moi@example.com',
      pending: true,
    });
    const { token } = await t.app.get(AuthLinks).issue(user.id, 'activation');
    started = performance.now();
    await call(t.app, 'POST', '/api/auth/links/status', { body: { purpose: 'activation', token } });
    expect(performance.now() - started).toBeLessThan(100);
    started = performance.now();
    await consume('activation', token, PASSWORD_MOI);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
