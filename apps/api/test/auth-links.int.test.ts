import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthLinks } from '../src/modules/identity/auth-links/auth-links.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { days, minutes } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// PR 7c-1, docs/plan/slice-7c-thiet-ke-kiem-thu.md. Mọi bài đi qua giao diện công khai của `AuthLinks` (K1) hoặc HTTP.

let t: TestApp;
let links: AuthLinks;
const ACTOR = { ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (kiem-thu) Chrome/130' };
const PASSWORD_MOI = 'hoa-sen-no-sang-moi';

beforeAll(async () => {
  t = await createTestApp();
  links = t.app.get(AuthLinks);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(resetState);

describe('kích hoạt bằng Liên kết một lần', () => {
  it('A-01: phát hành rồi dùng đúng mã thì đặt được mật khẩu và đăng nhập được', async () => {
    const user = await seedUser({
      roleTags: ['candidate'],
      email: 'sv@example.com',
      username: 'sv2026001',
      pending: true,
    });
    expect((await login(t.app, 'sv2026001', PASSWORD_MOI)).res.statusCode).toBe(401); // chưa kích hoạt

    const { token } = await links.issue(user.id, 'activation');
    const result = await links.consume(token, 'activation', PASSWORD_MOI, ACTOR);

    expect(result).toEqual({ state: 'ok' });
    expect((await login(t.app, 'sv2026001', PASSWORD_MOI)).res.statusCode).toBe(200);
  });
});

const pendingUser = (extra: Parameters<typeof seedUser>[0] = {}) =>
  seedUser({
    roleTags: ['candidate'],
    email: 'sv@example.com',
    username: 'sv2026001',
    pending: true,
    ...extra,
  });

describe('mã không lộ, một mã còn hiệu lực mỗi loại (K1, K5)', () => {
  it('A-01b: kích hoạt đánh dấu tài khoản đã kích hoạt và email đã xác thực (TC 1), không còn bắt đổi mật khẩu', async () => {
    const user = await pendingUser();
    const before = await sql<{ activated_at: Date | null; email_verified_at: Date | null }>(
      'SELECT activated_at, email_verified_at FROM users WHERE id = $1',
      [user.id],
    );
    expect(before[0]).toEqual({ activated_at: null, email_verified_at: null });

    const { token } = await links.issue(user.id, 'activation');
    await links.consume(token, 'activation', PASSWORD_MOI, ACTOR);
    const after = await sql<{
      activated_at: Date;
      email_verified_at: Date;
      must_change_password: boolean;
    }>('SELECT activated_at, email_verified_at, must_change_password FROM users WHERE id = $1', [
      user.id,
    ]);
    expect(after[0]?.activated_at).toEqual(t.clock.now());
    expect(after[0]?.email_verified_at).toEqual(t.clock.now());
    expect(after[0]?.must_change_password).toBe(false);
  });

  it('A-02: bảng auth_tokens chỉ chứa SHA-256 của mã, không chứa mã (TC 3)', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    const rows = await sql<{ token_hash: string }>('SELECT * FROM auth_tokens');
    expect(rows).toHaveLength(1);
    // Giá trị mong đợi tính độc lập bằng thư viện chuẩn, không lấy từ mã của hệ thống.
    expect(rows[0]?.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('A-03: phát hành lần hai cùng loại thì mã cũ bị thay (replaced), chỉ mã mới dùng được', async () => {
    const user = await pendingUser();
    const first = await links.issue(user.id, 'activation');
    const second = await links.issue(user.id, 'activation');
    expect(await links.consume(first.token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({
      state: 'replaced',
    });
    expect(await links.consume(second.token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({
      state: 'ok',
    });
  });

  it('A-03b: mã của loại khác nhau không làm mất hiệu lực của nhau', async () => {
    const user = await pendingUser();
    const activation = await links.issue(user.id, 'activation');
    await links.issue(user.id, 'password_reset');
    expect(await links.status(activation.token, 'activation')).toMatchObject({ state: 'ok' });
  });

  it('A-04: mã đúng nhưng dùng cho loại khác (đặt lại dùng làm kích hoạt) là unknown và không bị tiêu', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'password_reset');
    expect(await links.consume(token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({
      state: 'unknown',
    });
    expect(await links.consume(token, 'password_reset', PASSWORD_MOI, ACTOR)).toEqual({
      state: 'ok',
    });
  });
});

describe('kết quả có kiểu (K1, TC 1, 14, 15, 17)', () => {
  it('A-05: dùng lần hai trả used kèm lúc đã dùng', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    const usedAt = t.clock.now();
    await links.consume(token, 'activation', PASSWORD_MOI, ACTOR);
    t.clock.advance(minutes(5));
    expect(await links.consume(token, 'activation', 'mot-mat-khau-khac-nua', ACTOR)).toEqual({
      state: 'used',
      usedAt,
    });
  });

  it('A-05b: status chỉ đọc, không tiêu mã: xem nhiều lần rồi vẫn dùng được', async () => {
    const user = await pendingUser();
    const { token, expiresAt } = await links.issue(user.id, 'activation');
    expect(await links.status(token, 'activation')).toEqual({ state: 'ok', expiresAt });
    expect(await links.status(token, 'activation')).toEqual({ state: 'ok', expiresAt });
    expect(await links.consume(token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({ state: 'ok' });
  });

  it.each([
    ['activation', days(7)],
    ['password_reset', minutes(60)],
    ['email_change', days(1)],
    ['support_link', minutes(60)],
  ] as const)(
    'A-06: mã %s hết hạn đúng mốc: còn dùng tới trước mốc, hết hạn từ mốc, kèm giờ hết hạn',
    async (purpose, ttl) => {
      const user = await pendingUser();
      const { token, expiresAt } = await links.issue(user.id, purpose);
      expect(expiresAt.getTime()).toBe(t.clock.now().getTime() + ttl);

      t.clock.advance(ttl - 1);
      expect(await links.status(token, purpose)).toMatchObject({ state: 'ok' });
      t.clock.advance(1);
      expect(await links.status(token, purpose)).toEqual({
        state: 'expired',
        expiredAt: expiresAt,
      });
      expect(await links.consume(token, purpose, PASSWORD_MOI, ACTOR)).toEqual({
        state: 'expired',
        expiredAt: expiresAt,
      });
    },
  );

  it('A-07: tài khoản bị Khóa hoặc đã Xóa thì liên kết bị chặn (blocked)', async () => {
    for (const extra of [{ status: 'locked' as const }, { removed: true }]) {
      const user = await pendingUser({
        username: null,
        email: `${Math.random().toString(36).slice(2)}@example.com`,
        ...extra,
      });
      const { token } = await links.issue(user.id, 'activation');
      expect(await links.consume(token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({
        state: 'blocked',
      });
    }
  });

  it('A-07b: Khóa rồi Mở khóa thì liên kết còn hạn dùng lại được (quyết định 11/11/2026)', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    await sql("UPDATE users SET status = 'locked' WHERE id = $1", [user.id]);
    expect(await links.status(token, 'activation')).toEqual({ state: 'blocked' });
    await sql("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    expect(await links.consume(token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({ state: 'ok' });
  });

  it('A-08: mã không khớp bản ghi nào chỉ trả unknown, không kèm chi tiết nào khác', async () => {
    const result = await links.consume(
      'ma-khong-ton-tai-0123456789abcdefghijklmnopqrs',
      'activation',
      PASSWORD_MOI,
      ACTOR,
    );
    expect(result).toEqual({ state: 'unknown' });
    expect(Object.keys(result)).toEqual(['state']);
    expect(
      await links.status('ma-khong-ton-tai-0123456789abcdefghijklmnopqrs', 'activation'),
    ).toEqual({ state: 'unknown' });
  });
});

describe('đặt mật khẩu (K1, TC 2, 3)', () => {
  it('A-09: mật khẩu vi phạm chính sách bị từ chối kèm lý do và KHÔNG tiêu mã', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    expect(await links.consume(token, 'activation', 'ngan123', ACTOR)).toEqual({
      state: 'policy',
      violations: ['too_short'],
    });
    expect(await links.consume(token, 'activation', 'password123', ACTOR)).toEqual({
      state: 'policy',
      violations: ['common'],
    });
    expect(await links.consume(token, 'activation', 'xin-chao-sv2026001-nhe', ACTOR)).toEqual({
      state: 'policy',
      violations: ['contains_identity'],
    });
    expect(await links.status(token, 'activation')).toMatchObject({ state: 'ok' });
    expect(await links.consume(token, 'activation', PASSWORD_MOI, ACTOR)).toEqual({ state: 'ok' });
  });

  it('A-10: đặt lại mật khẩu thu hồi mọi phiên cũ, không tự đăng nhập, ghi nhật ký có IP và trình duyệt, không chứa mật khẩu hay mã', async () => {
    const user = await seedUser({
      roleTags: ['candidate'],
      email: 'sv@example.com',
      username: 'sv2026001',
    });
    const old = await login(t.app, 'sv2026001', DEFAULT_PASSWORD);
    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: old.cookie })).statusCode).toBe(200);

    const { token } = await links.issue(user.id, 'password_reset');
    expect(await links.consume(token, 'password_reset', PASSWORD_MOI, ACTOR)).toEqual({
      state: 'ok',
    });

    expect((await call(t.app, 'GET', '/api/auth/me', { cookie: old.cookie })).statusCode).toBe(401);
    expect((await login(t.app, 'sv2026001', DEFAULT_PASSWORD)).res.statusCode).toBe(401);
    expect((await login(t.app, 'sv2026001', PASSWORD_MOI)).res.statusCode).toBe(200);

    const rows = await sql<{ action: string; actor_id: string; ip: string; after: unknown }>(
      'SELECT action, actor_id, host(ip) AS ip, after FROM audit_logs WHERE entity_id = $1',
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'account.password-reset',
      actor_id: user.id,
      ip: '203.0.113.5',
    });
    expect(JSON.stringify(rows[0]?.after)).toContain('Chrome/130');
    expect(JSON.stringify(rows)).not.toContain(PASSWORD_MOI);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('A-10b: kích hoạt ghi nhật ký account.activated', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    await links.consume(token, 'activation', PASSWORD_MOI, ACTOR);
    const rows = await sql<{ action: string }>(
      'SELECT action FROM audit_logs WHERE entity_id = $1',
      [user.id],
    );
    expect(rows.map((r) => r.action)).toEqual(['account.activated']);
  });

  it('A-10c: tài khoản đã có mật khẩu mà activated_at còn rỗng (dữ liệu cũ) đặt lại thì ghi account.password-reset, không phải kích hoạt', async () => {
    const user = await seedUser({
      roleTags: ['candidate'],
      username: 'du-lieu-cu',
      email: 'cu@example.com',
    });
    await sql('UPDATE users SET activated_at = NULL WHERE id = $1', [user.id]);
    const { token } = await links.issue(user.id, 'password_reset');
    await links.consume(token, 'password_reset', PASSWORD_MOI, ACTOR);
    const rows = await sql<{ action: string }>(
      'SELECT action FROM audit_logs WHERE entity_id = $1',
      [user.id],
    );
    expect(rows.map((r) => r.action)).toEqual(['account.password-reset']);
  });

  it('A-11: hai lần dùng đồng thời cùng một mã thì đúng một lần thành công', async () => {
    const user = await pendingUser();
    const { token } = await links.issue(user.id, 'activation');
    const results = await Promise.all([
      links.consume(token, 'activation', PASSWORD_MOI, ACTOR),
      links.consume(token, 'activation', 'mat-khau-song-song-khac', ACTOR),
    ]);
    expect(results.filter((r) => r.state === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r.state === 'used')).toHaveLength(1);
  });
});
