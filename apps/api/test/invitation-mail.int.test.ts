import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { captureLogs } from './support/capture-logs';
import { sql } from './support/db';
import { days, seconds } from './support/fake-clock';
import { call, login, sessionCookieOf } from './support/http';
import { resetState } from './support/reset';
import { seedUnit } from './support/units';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7c-2b lát 3 (docs/plan/slice-7c2-thiet-ke-kiem-thu.md K11): Lời mời Người ra đề tự gửi thư. Mã sinh LÚC GỬI, nằm ở mảnh #
// của liên kết (API nhận mã trong thân POST), nhận Lời mời xác thực email và vẫn đăng nhập luôn (quyết định 12/11/2026).

let t: TestApp;
let adminCookie: string;
let adminId: string;
let unitId: string;
const EMAIL = 'giang.vien@example.edu.vn';
const NEW_PASSWORD = 'mat-khau-moi-rat-dai';

beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
  adminId = (await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' })).id;
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  unitId = (await seedUnit('CNTT', 'Khoa CNTT')).id;
});

const asAdmin = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
  call(t.app, method, url, { cookie: adminCookie, body });
const create = (email = EMAIL) =>
  asAdmin('POST', '/api/admin/invitations', { email, fullName: 'Lê Thị Giảng', unitId });
const preview = (token: string) =>
  call(t.app, 'POST', '/api/invitations/preview', { body: { token } });
const accept = (token: string, body: Record<string, unknown>) =>
  call(t.app, 'POST', '/api/invitations/accept', { body: { token, ...body } });

/** Mã trong liên kết duy nhất của thư mời (mảnh sau dấu #), kèm đường dẫn để kiểm trang đích. */
function linkIn(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  const url = new URL(urls[0] as string);
  return { path: url.pathname, search: url.search, token: url.hash.slice(1) };
}

describe('Lời mời gửi thư (K11)', () => {
  it('B-10: tạo Lời mời xếp thư mời (làn khẩn, người xếp là Quản trị viên); phản hồi không chứa mã; thư có liên kết /invite#mã', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    expect(res.json()).not.toHaveProperty('token');
    await t.queue.drain();

    expect(t.mail.sent.map((m) => m.to)).toEqual([EMAIL]);
    const sent = t.mail.sent[0];
    expect(sent?.subject).toContain('Lời mời');
    expect(sent?.text).toContain('Lê Thị Giảng');
    expect(sent?.text).toContain('Quản Trị'); // ai mời
    const link = linkIn(sent?.text as string);
    expect(link).toMatchObject({ path: '/invite', search: '' });
    expect(link.token.length).toBeGreaterThan(30);

    const rows = await sql<{ lane: string; requested_by: string }>(
      'SELECT lane, requested_by FROM email_outbox',
    );
    expect(rows).toEqual([{ lane: 'urgent', requested_by: adminId }]);
    expect((await preview(link.token)).statusCode).toBe(200);
  });

  it('B-11: gửi lỗi tạm thời rồi thử lại: mã của lần thử đầu mất hiệu lực (băm trong cơ sở dữ liệu đổi), thư sau dùng được', async () => {
    t.mail.failNext('temporary', { to: EMAIL });
    await create();
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
    const [first] = await sql<{ token_hash: string }>('SELECT token_hash FROM invitations');

    t.clock.advance(seconds(61));
    await t.app.get(JobRegistry).run('mail.dispatch', {});
    const [second] = await sql<{ token_hash: string }>('SELECT token_hash FROM invitations');
    expect(second?.token_hash).not.toBe(first?.token_hash);
    const { token } = linkIn(t.mail.sent[0]?.text as string);
    expect(second?.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('B-12: Tạo lại liên kết: liên kết cũ chết NGAY (trước khi thư mới được gửi), thư mới gửi liên kết mới', async () => {
    const id = (await create()).json().id;
    await t.queue.drain();
    const old = linkIn(t.mail.sent[0]?.text as string).token;
    t.mail.reset();

    expect((await asAdmin('POST', `/api/admin/invitations/${id}/regenerate`)).statusCode).toBe(200);
    expect((await preview(old)).statusCode).toBe(404); // chưa chạy job gửi mà liên kết cũ đã chết
    await t.queue.drain();

    expect(t.mail.sent).toHaveLength(1);
    const fresh = linkIn(t.mail.sent[0]?.text as string).token;
    expect(fresh).not.toBe(old);
    expect((await preview(fresh)).statusCode).toBe(200);
  });

  it('B-13: Thu hồi thì liên kết chết; thu hồi trước khi thư được gửi thì thư không gửi nữa', async () => {
    const id = (await create()).json().id;
    await t.queue.drain();
    const token = linkIn(t.mail.sent[0]?.text as string).token;
    await asAdmin('POST', `/api/admin/invitations/${id}/revoke`);
    expect((await preview(token)).statusCode).toBe(404);

    t.mail.reset();
    const id2 = (await create('khac@example.edu.vn')).json().id;
    await asAdmin('POST', `/api/admin/invitations/${id2}/revoke`);
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
    // Thư được HỦY (skipped), không phải để kẹt thử lại rồi thất bại: hàng đợi sạch.
    const rows = await sql<{ status: string }>(
      "SELECT status FROM email_outbox WHERE to_email = 'khac@example.edu.vn'",
    );
    expect(rows).toEqual([{ status: 'skipped' }]);
  });

  it('B-14: nhận Lời mời bằng liên kết trong thư tạo Người ra đề, email đã xác thực, và đăng nhập luôn', async () => {
    await create();
    await t.queue.drain();
    const { token } = linkIn(t.mail.sent[0]?.text as string);

    const res = await accept(token, { password: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, createdAccount: true });
    const cookie = sessionCookieOf(res);
    expect(cookie).toBeTruthy();

    const account = (await call(t.app, 'GET', '/api/account', { cookie })).json();
    expect(account).toMatchObject({ email: EMAIL, emailVerified: true, roleTags: ['examiner'] });
    expect((await login(t.app, EMAIL, NEW_PASSWORD)).res.statusCode).toBe(200);
  });

  it('B-15: hạn 7 ngày tính từ lúc thư được gửi đi thật, không từ lúc tạo Lời mời', async () => {
    await create();
    t.queue.discard(); // thư nằm chờ; cron gửi sau 3 ngày
    t.clock.advance(days(3));
    const sendTime = t.clock.now().getTime();
    await t.app.get(JobRegistry).run('mail.dispatch', {});

    const [row] = await sql<{ expires_at: Date }>('SELECT expires_at FROM invitations');
    expect(row?.expires_at.getTime()).toBe(sendTime + days(7));
  });

  it('B-16: Lời mời tới email của Quản trị viên hoặc của người đã là Người ra đề vẫn bị từ chối và không gửi thư', async () => {
    await seedUser({ username: 'qt2', isAdmin: true, email: 'qt2@example.edu.vn' });
    await seedUser({ roleTags: ['examiner'], username: 'gv', email: 'gv@example.edu.vn' });
    expect((await create('qt2@example.edu.vn')).statusCode).toBe(400);
    expect((await create('gv@example.edu.vn')).statusCode).toBe(400);
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);
  });

  it('B-17: quét log, nhật ký, hàng đợi thư và bảng Lời mời sau tạo, Tạo lại, nhận: mã và mật khẩu chỉ nằm trong thư; không email đầy đủ trong log', async () => {
    const tokens: string[] = [];
    const logs = await captureLogs(async () => {
      const id = (await create()).json().id;
      await t.queue.drain();
      tokens.push(linkIn(t.mail.sent[0]?.text as string).token);
      await asAdmin('POST', `/api/admin/invitations/${id}/regenerate`);
      await t.queue.drain();
      const latest = linkIn(t.mail.sent[1]?.text as string).token;
      tokens.push(latest);
      await accept(latest, { password: NEW_PASSWORD });
      await preview(tokens[0] as string); // mã cũ: bị từ chối
    });

    const dumps = [
      logs.join('\n'),
      JSON.stringify(await sql('SELECT * FROM audit_logs')),
      JSON.stringify(await sql('SELECT * FROM email_outbox')),
      JSON.stringify(await sql('SELECT * FROM invitations')),
      JSON.stringify(await sql('SELECT * FROM login_events')),
    ];
    for (const dump of dumps)
      for (const secret of [...tokens, NEW_PASSWORD]) expect(dump).not.toContain(secret);
    expect(logs.join('\n')).not.toMatch(/giang\.vien@example\.edu\.vn/);
    expect(t.mail.sent.some((m) => m.text.includes(tokens[1] as string))).toBe(true); // có nội dung để quét
  });
});
