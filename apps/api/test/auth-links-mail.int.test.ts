import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthLinks } from '../src/modules/identity/auth-links/auth-links.service';
import { MailService } from '../src/modules/mail/mail.service';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { days } from './support/fake-clock';
import { login } from './support/http';
import { resetState } from './support/reset';
import { seedUser } from './support/users';

// PR 7c-1, K2: `MailService` THẬT + bộ dựng thư THẬT của `identity` + vận chuyển giả; đọc liên kết từ thư đã "gửi" rồi dùng nó.

let t: TestApp;
let mail: MailService;
let links: AuthLinks;
const CLIENT = { ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (kiem-thu)' };
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
  mail = t.app.get(MailService);
  links = t.app.get(AuthLinks);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
});

/** Liên kết duy nhất trong thư đã gửi, tách thành đường dẫn và mã (mảnh sau dấu #). */
function linkIn(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  const url = new URL(urls[0] as string);
  return { url, origin: url.origin, path: url.pathname, token: url.hash.slice(1) };
}

const pendingUser = () =>
  seedUser({
    roleTags: ['candidate'],
    email: 'sv@example.com',
    username: 'sv2026001',
    fullName: 'Nguyễn Văn An',
    pending: true,
  });

describe('thư kích hoạt với bộ dựng thật (K2)', () => {
  it('A-12: xếp thư kích hoạt rồi chạy job: thư có liên kết, dùng liên kết đó đặt được mật khẩu và đăng nhập', async () => {
    const user = await pendingUser();
    await mail.enqueue({
      kind: 'activation',
      toEmail: 'sv@example.com',
      lane: 'bulk',
      userId: user.id,
    });
    await t.queue.drain();

    expect(t.mail.sent).toHaveLength(1);
    const sent = t.mail.sent[0];
    expect(sent?.text).toContain('Nguyễn Văn An');
    expect(sent?.text).toContain('sv2026001');
    const { token } = linkIn(sent?.text as string);

    expect(await links.consume(token, 'activation', PASSWORD_MOI, CLIENT)).toEqual({ state: 'ok' });
    expect((await login(t.app, 'sv2026001', PASSWORD_MOI)).res.statusCode).toBe(200);
  });

  it('A-13: gửi lỗi tạm thời rồi thử lại: mã của lần thử đầu bị vô hiệu, chỉ còn đúng một mã hiệu lực', async () => {
    const user = await pendingUser();
    t.mail.failNext('temporary', { to: 'sv@example.com' });
    await mail.enqueue({
      kind: 'activation',
      toEmail: 'sv@example.com',
      lane: 'bulk',
      userId: user.id,
    });
    await t.queue.drain();
    expect(t.mail.sent).toEqual([]);

    t.clock.advance(61_000);
    await t.app.get(JobRegistry).run('mail.dispatch', {});

    expect(t.mail.sent).toHaveLength(1);
    const rows = await sql<{ n: string; active: string }>(
      'SELECT count(*) AS n, count(*) FILTER (WHERE replaced_at IS NULL AND used_at IS NULL) AS active FROM auth_tokens',
    );
    expect(rows[0]).toMatchObject({ n: '2', active: '1' });
    const { token } = linkIn(t.mail.sent[0]?.text as string);
    expect(await links.status(token, 'activation')).toMatchObject({ state: 'ok' });
  });

  it('A-14: liên kết dựng từ địa chỉ cấu hình cố định (APP_ORIGINS), trỏ tới trang kích hoạt', async () => {
    const user = await pendingUser();
    await mail.enqueue({
      kind: 'activation',
      toEmail: 'sv@example.com',
      lane: 'bulk',
      userId: user.id,
    });
    await t.queue.drain();
    const link = linkIn(t.mail.sent[0]?.text as string);
    expect(link.origin).toBe('http://localhost:5173');
    expect(link.path).toBe('/activate');
    expect(link.url.search).toBe(''); // mã nằm ở mảnh #, không ở query nên không lọt vào log máy chủ
  });

  it('A-15: hạn 7 ngày của thư kích hoạt tính từ lúc thư được gửi đi thật, không từ lúc xếp hàng (Q374)', async () => {
    const user = await pendingUser();
    await mail.enqueue({
      kind: 'activation',
      toEmail: 'sv@example.com',
      lane: 'bulk',
      userId: user.id,
    });
    t.queue.discard(); // thư nằm chờ vì hạn mức; cron gửi sau 3 ngày
    t.clock.advance(days(3));
    const sendTime = t.clock.now().getTime();
    await t.app.get(JobRegistry).run('mail.dispatch', {});

    const { token } = linkIn(t.mail.sent[0]?.text as string);
    const status = await links.status(token, 'activation');
    expect(status).toMatchObject({ state: 'ok' });
    expect((status as { expiresAt: Date }).expiresAt.getTime()).toBe(sendTime + days(7));
  });
});
