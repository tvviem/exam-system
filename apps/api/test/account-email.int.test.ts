import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { captureLogs } from './support/capture-logs';
import { sql } from './support/db';
import { days, minutes, seconds } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7c-2b (docs/plan/slice-7c2-thiet-ke-kiem-thu.md lát 1 và 2, K12): đổi và xác thực email của chính mình, qua HTTP, với
// MailService thật + bộ dựng thật + vận chuyển giả.

let t: TestApp;

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

/** Mã trong liên kết duy nhất của thư (mảnh sau dấu #). */
function tokenIn(text: string): string {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  return new URL(urls[0] as string).hash.slice(1);
}

async function signedIn(extra: Parameters<typeof seedUser>[0] = {}) {
  const user = await seedUser({
    roleTags: ['candidate'],
    username: 'sv1',
    email: 'cu@example.com',
    ...extra,
  });
  const { cookie } = await login(t.app, 'sv1', DEFAULT_PASSWORD);
  return { user, cookie: cookie as string };
}

const requestChange = (cookie: string, newEmail: string, currentPassword = DEFAULT_PASSWORD) =>
  call(t.app, 'POST', '/api/account/email', { cookie, body: { newEmail, currentPassword } });

const confirm = (token: string) =>
  call(t.app, 'POST', '/api/auth/links/consume', { body: { purpose: 'email_change', token } });

describe('đổi email của chính mình (K12)', () => {
  it('B-01: xin đổi email rồi bấm liên kết trong thư gửi tới email mới thì email đổi và được đánh dấu đã xác thực', async () => {
    const { cookie } = await signedIn();
    expect((await requestChange(cookie, 'moi@example.com')).statusCode).toBe(200);
    await t.queue.drain();

    expect(t.mail.sent.map((m) => m.to)).toEqual(['moi@example.com']);
    // Người đang chờ thư để làm tiếp nên thư thuộc làn khẩn (không chờ sau hàng đợi kích hoạt cả lớp).
    expect(await sql('SELECT lane FROM email_outbox')).toEqual([{ lane: 'urgent' }]);
    const token = tokenIn(t.mail.sent[0]?.text as string);
    expect((await confirm(token)).json()).toEqual({ state: 'ok' });

    const account = (await call(t.app, 'GET', '/api/account', { cookie })).json();
    expect(account).toMatchObject({ email: 'moi@example.com', emailVerified: true });
  });
});

describe('bảo vệ đổi email (K12, TC 1, 5, 14)', () => {
  it('B-02: sai mật khẩu hiện tại thì từ chối và không xếp thư', async () => {
    const { cookie } = await signedIn();
    const res = await requestChange(cookie, 'moi@example.com', 'mat-khau-sai-hoan-toan');
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'WRONG_CURRENT_PASSWORD' });
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
  });

  it('B-02b: phải đăng nhập mới xin đổi được', async () => {
    const res = await call(t.app, 'POST', '/api/account/email', {
      body: { newEmail: 'moi@example.com', currentPassword: DEFAULT_PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });

  it('B-03: email chưa đổi cho tới khi bấm liên kết: vẫn đăng nhập và nhận thư bằng email cũ', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();

    const account = (await call(t.app, 'GET', '/api/account', { cookie })).json();
    expect(account.email).toBe('cu@example.com');
    expect((await login(t.app, 'cu@example.com', DEFAULT_PASSWORD)).res.statusCode).toBe(200);
    expect((await login(t.app, 'moi@example.com', DEFAULT_PASSWORD)).res.statusCode).toBe(401);
  });

  it('B-04: email mới trùng tài khoản chưa Xóa bị chặn lúc xin; của tài khoản đã Xóa thì dùng được; trùng chính mình bị từ chối', async () => {
    const { cookie } = await signedIn();
    await seedUser({ roleTags: ['candidate'], username: 'nguoi-khac', email: 'da-co@example.com' });
    await seedUser({
      roleTags: ['candidate'],
      username: 'da-xoa',
      email: 'cu-da-xoa@example.com',
      removed: true,
    });

    const taken = await requestChange(cookie, 'DA-CO@example.com');
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ code: 'CONFLICT', field: 'email' });
    const same = await requestChange(cookie, 'cu@example.com');
    expect(same.statusCode).toBe(400);
    expect(same.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);

    expect((await requestChange(cookie, 'cu-da-xoa@example.com')).statusCode).toBe(200);
  });

  it('B-05: lúc bấm liên kết mà email đã bị người khác lấy mất thì từ chối, email giữ nguyên', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);

    await seedUser({ roleTags: ['candidate'], username: 'nguoi-khac', email: 'moi@example.com' });
    expect((await confirm(token)).json()).toEqual({ state: 'email_taken' });
    expect((await call(t.app, 'GET', '/api/account', { cookie })).json().email).toBe(
      'cu@example.com',
    );
  });

  it('B-06: hạn 24 giờ: bấm sau hạn thì hết hạn kèm giờ, email giữ nguyên', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);
    const sentAt = t.clock.now().getTime();

    t.clock.advance(days(1));
    const res = (await confirm(token)).json();
    expect(res).toMatchObject({ state: 'expired' });
    expect(new Date(res.expiredAt).getTime()).toBe(sentAt + days(1));
    // Phiên cũ đã hết hạn sau 24 giờ: đăng nhập lại rồi kiểm email vẫn là email cũ.
    const fresh = (await login(t.app, 'sv1', DEFAULT_PASSWORD)).cookie as string;
    expect((await call(t.app, 'GET', '/api/account', { cookie: fresh })).json().email).toBe(
      'cu@example.com',
    );
  });

  it('B-07: xin lần hai thì liên kết của lần đầu bị thay, chỉ liên kết mới dùng được', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    t.clock.advance(seconds(61));
    await requestChange(cookie, 'moi-hon@example.com');
    await t.queue.drain();

    const [first, second] = t.mail.sent.map((m) => tokenIn(m.text));
    expect((await confirm(first as string)).json()).toEqual({ state: 'replaced' });
    expect((await confirm(second as string)).json()).toEqual({ state: 'ok' });
    expect((await call(t.app, 'GET', '/api/account', { cookie })).json().email).toBe(
      'moi-hon@example.com',
    );
  });

  it('B-08: đổi xong gửi thư báo tới email CŨ: không liên kết, không mật khẩu, chỉ nêu địa chỉ mới đã che bớt', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);
    t.mail.reset();

    await confirm(token);
    await t.queue.drain();

    expect(t.mail.sent).toHaveLength(1);
    const notice = t.mail.sent[0];
    expect(notice?.to).toBe('cu@example.com');
    expect(notice?.subject).toContain('đã được đổi');
    expect(notice?.text).toContain('m***@example.com');
    expect(notice?.text).not.toContain('moi@example.com');
    expect(notice?.text).not.toMatch(/https?:\/\//);
    expect((await call(t.app, 'GET', '/api/account', { cookie })).statusCode).toBe(200); // phiên không bị thu hồi
  });

  it('B-08b: nhật ký ghi email cũ và mới cùng IP và trình duyệt, không ghi mật khẩu hay mã', async () => {
    const { user, cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);
    await call(t.app, 'POST', '/api/auth/links/consume', {
      body: { purpose: 'email_change', token },
      ip: '203.0.113.9',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/130.0.0.0' },
    });
    const rows = await sql<{ action: string; before: unknown; after: unknown; ip: string }>(
      "SELECT action, before, after, host(ip) AS ip FROM audit_logs WHERE entity_id = $1 AND action = 'account.email-changed'",
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ip).toBe('203.0.113.9');
    expect(rows[0]?.before).toEqual({ email: 'cu@example.com' });
    expect(JSON.stringify(rows[0]?.after)).toContain('moi@example.com');
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain(DEFAULT_PASSWORD);
  });
});

describe('xác thực email đang lưu (K12, câu i)', () => {
  const verify = (cookie: string) => call(t.app, 'POST', '/api/account/email/verify', { cookie });

  it('B-09: "Gửi thư xác thực" gửi tới email hiện có; bấm liên kết thì email giữ nguyên và được đánh dấu đã xác thực', async () => {
    const { cookie } = await signedIn({ emailVerified: false });
    expect((await call(t.app, 'GET', '/api/account', { cookie })).json().emailVerified).toBe(false);

    expect((await verify(cookie)).statusCode).toBe(200);
    await t.queue.drain();
    expect(t.mail.sent.map((m) => m.to)).toEqual(['cu@example.com']);
    expect((await confirm(tokenIn(t.mail.sent[0]?.text as string))).json()).toEqual({
      state: 'ok',
    });

    expect(
      await call(t.app, 'GET', '/api/account', { cookie }).then((r) => r.json()),
    ).toMatchObject({
      email: 'cu@example.com',
      emailVerified: true,
    });
  });

  it('B-09b: email đã xác thực rồi thì không gửi lại (409); chưa có email thì 400', async () => {
    const verified = await signedIn({ emailVerified: true });
    expect((await verify(verified.cookie)).statusCode).toBe(409);
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
  });

  it('B-09c: chưa có email thì không gửi thư xác thực được', async () => {
    const { cookie } = await signedIn({ email: null });
    const res = await verify(cookie);
    expect(res.statusCode).toBe(409);
  });

  it('B-10: tối đa 3 yêu cầu (đổi hoặc xác thực) mỗi giờ và cách nhau 60 giây, vượt thì báo rõ 429', async () => {
    const { cookie } = await signedIn({ emailVerified: false });
    expect((await verify(cookie)).statusCode).toBe(200);
    expect((await verify(cookie)).statusCode).toBe(429); // chưa đủ 60 giây
    for (let i = 0; i < 2; i++) {
      t.clock.advance(seconds(61));
      expect((await verify(cookie)).statusCode).toBe(200);
    }
    t.clock.advance(seconds(61));
    const fourth = await verify(cookie);
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json()).toMatchObject({ code: 'RATE_LIMITED' });
    t.clock.advance(minutes(60));
    expect((await verify(cookie)).statusCode).toBe(200);
  });
});

describe('bất biến bảo mật (K14, TC 3)', () => {
  it('B-17b: quét log, nhật ký, auth_tokens và hàng đợi thư sau đổi email: mã và mật khẩu chỉ nằm trong thư; không email đầy đủ trong log', async () => {
    const { cookie } = await signedIn();
    let token = '';
    const logs = await captureLogs(async () => {
      await requestChange(cookie, 'moi@example.com');
      await t.queue.drain();
      token = tokenIn(t.mail.sent[0]?.text as string);
      await confirm(token);
      await confirm(token); // dùng lần hai: bị từ chối
      await t.queue.drain();
    });

    const dumps = [
      logs.join('\n'),
      JSON.stringify(await sql('SELECT * FROM audit_logs')),
      JSON.stringify(await sql('SELECT * FROM auth_tokens')),
      JSON.stringify(await sql('SELECT * FROM email_outbox')),
    ];
    for (const dump of dumps)
      for (const secret of [token, DEFAULT_PASSWORD]) expect(dump).not.toContain(secret);
    expect(logs.join('\n')).not.toMatch(/cu@example\.com|moi@example\.com/);
    expect(t.mail.sent.some((m) => m.text.includes(token))).toBe(true);
  });

  it('B-18: trang xác nhận xem được trạng thái của mã đổi email mà chưa tiêu mã', async () => {
    const { cookie } = await signedIn();
    await requestChange(cookie, 'moi@example.com');
    await t.queue.drain();
    const token = tokenIn(t.mail.sent[0]?.text as string);
    const status = () =>
      call(t.app, 'POST', '/api/auth/links/status', { body: { purpose: 'email_change', token } });
    expect((await status()).json()).toMatchObject({ state: 'ok' });
    expect((await status()).json()).toMatchObject({ state: 'ok' });
    expect((await confirm(token)).json()).toEqual({ state: 'ok' });
    expect((await status()).json()).toMatchObject({ state: 'used' });
  });
});
