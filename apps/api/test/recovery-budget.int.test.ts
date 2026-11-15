import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7d-1, K22 (chống lạm dụng): "Quên mật khẩu" là cửa công khai gửi thư, nên có NGÂN SÁCH THƯ ẨN DANH toàn hệ thống
// (30 thư mỗi giờ, 60 thư mỗi ngày) để kẻ xấu dùng nhiều IP không đốt hết hạn mức Gmail (100 thư khẩn dự trữ mỗi 24 giờ) của
// Lời mời, hỗ trợ kích hoạt, đổi email. Vượt ngân sách thì vẫn trả đúng một câu cho mọi người và không gửi thêm thư.

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

/** Mỗi lần gọi một IP khác nhau, để giới hạn theo IP (20 mỗi giờ) không che mất ngân sách toàn hệ thống. */
let ipCounter = 0;
const forgot = (identifier: string) =>
  call(t.app, 'POST', '/api/auth/forgot-password', {
    body: { identifier },
    ip: `198.51.100.${(ipCounter++ % 250) + 1}`,
  });

async function seedMany(count: number, prefix: string) {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const username = `${prefix}${i}`;
    await seedUser({ username, email: `${username}@example.edu.vn`, emailVerified: true });
    names.push(username);
  }
  return names;
}

describe('ngân sách thư ẩn danh của Quên mật khẩu (K22)', () => {
  it('D-47: tối đa 30 thư mỗi giờ; câu trả lời vẫn giống hệt cho mọi người', async () => {
    const names = await seedMany(35, 'a');
    const bodies = new Set<string>();
    for (const name of names) {
      const res = await forgot(name);
      expect(res.statusCode).toBe(200);
      bodies.add(res.body);
    }
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(30);
    expect(bodies.size).toBe(1);

    // Sang giờ sau thì có ngân sách mới.
    t.clock.advance(minutes(61));
    await forgot('a30');
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(31);
  });

  it('D-48: tối đa 60 thư mỗi ngày dù các giờ khác nhau', async () => {
    const names = await seedMany(75, 'b');
    for (let hour = 0; hour < 3; hour++) {
      for (const name of names.slice(hour * 25, hour * 25 + 25)) await forgot(name);
      t.clock.advance(minutes(61));
    }
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(60);
  });

  it('D-51: tài khoản Chờ kích hoạt gửi lại thư kích hoạt cũng tính vào ngân sách', async () => {
    const names: string[] = [];
    for (let i = 0; i < 35; i++) {
      const username = `p${i}`;
      await seedUser({ username, email: `${username}@example.edu.vn`, pending: true });
      names.push(username);
    }
    for (const name of names) await forgot(name);
    await t.queue.drain();
    expect(t.mail.sent).toHaveLength(30);
  });

  it('D-49: tên không tồn tại, tài khoản bị Khóa, email chưa xác thực không tiêu ngân sách', async () => {
    for (let i = 0; i < 60; i++) await forgot(`khong-co-${i}`);
    const locked = await seedUser({
      username: 'bi-khoa',
      email: 'bk@example.edu.vn',
      emailVerified: true,
    });
    await sql("UPDATE users SET status = 'locked' WHERE id = $1", [locked.id]);
    await seedUser({ username: 'chua-xt', email: 'cx@example.edu.vn' });
    await forgot('bi-khoa');
    await forgot('chua-xt');
    await seedUser({ username: 'that', email: 'that@example.edu.vn', emailVerified: true });
    await forgot('that');
    await t.queue.drain();
    expect(t.mail.sent.map((m) => m.to)).toEqual(['that@example.edu.vn']);
  });

  it('D-50: hết ngân sách ẩn danh vẫn không chặn thư của người đã đăng nhập (thư xác thực email của mình)', async () => {
    const names = await seedMany(35, 'c');
    for (const name of names) await forgot(name);
    const me = await seedUser({ username: 'toi', email: 'toi@example.edu.vn' });
    const { cookie } = await login(t.app, me.username as string, DEFAULT_PASSWORD);
    t.mail.reset();
    const res = await call(t.app, 'POST', '/api/account/email/verify', {
      cookie: cookie as string,
    });
    expect(res.statusCode).toBeLessThan(300);
    await t.queue.drain();
    expect(t.mail.sent.map((m) => m.to)).toContain('toi@example.edu.vn');
  });
});
