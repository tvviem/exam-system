import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LoginRateLimiter } from '../src/modules/identity/auth/login-rate-limiter';
import { configureHashGate } from '../src/modules/identity/password/hash-gate';
import { createTestApp, type TestApp } from './support/app';
import { minutes } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Hai lỗ hổng đăng nhập (docs/plan/slice-7d-thiet-ke-kiem-thu.md mục 12.2): V1 khóa nhắm vào một sinh viên, V2 đốt CPU bằng Argon2.

let t: TestApp;
const ATTACKER = '203.0.113.50';
const VICTIM_IP = '198.51.100.7';

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  configureHashGate({ concurrency: 4, maxQueue: 400 });
});

const wrong = (identifier: string, ip: string) => login(t.app, identifier, 'sai-mat-khau-roi', ip);

describe('V1: kẻ tấn công không khóa được sinh viên khác', () => {
  it('V1-a: kẻ tấn công vượt 10 lần thử bị giới hạn, nhưng sinh viên đăng nhập đúng từ IP khác vẫn vào được', async () => {
    await seedUser({ username: 'sv-nan-nhan' });
    for (let i = 0; i < 10; i++) await wrong('sv-nan-nhan', ATTACKER);
    const limited = await wrong('sv-nan-nhan', ATTACKER);
    expect(limited.res.json()).toMatchObject({
      code: expect.stringMatching(/RATE_LIMITED|LOGIN_TEMPORARILY_BLOCKED|INVALID_CREDENTIALS/),
    });

    const victim = await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, VICTIM_IP);
    expect(victim.res.statusCode).toBe(200);
  });

  it('V1-b: 5 lần sai từ IP của kẻ tấn công chỉ khóa cặp (tài khoản, IP đó); sinh viên từ IP khác không bị khóa', async () => {
    await seedUser({ username: 'sv-nan-nhan' });
    for (let i = 0; i < 5; i++) await wrong('sv-nan-nhan', ATTACKER);
    const attackerRight = await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, ATTACKER);
    expect(attackerRight.res.json()).toEqual({ code: 'LOGIN_TEMPORARILY_BLOCKED' });
    expect((await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, VICTIM_IP)).res.statusCode).toBe(
      200,
    );
  });

  it('V1-c: sinh viên đăng nhập thành công không gỡ khóa của IP kẻ tấn công', async () => {
    await seedUser({ username: 'sv-nan-nhan' });
    for (let i = 0; i < 5; i++) await wrong('sv-nan-nhan', ATTACKER);
    await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, VICTIM_IP);
    const again = await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, ATTACKER);
    expect(again.res.json()).toEqual({ code: 'LOGIN_TEMPORARILY_BLOCKED' });
  });

  it('V1-d: khóa của cặp hết sau 15 phút', async () => {
    await seedUser({ username: 'sv-nan-nhan' });
    for (let i = 0; i < 5; i++) await wrong('sv-nan-nhan', ATTACKER);
    t.clock.advance(minutes(15));
    expect((await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, ATTACKER)).res.statusCode).toBe(
      200,
    );
  });

  it('V1-e: giới hạn thử theo cặp (tên đăng nhập, IP): 10 lần mỗi 10 phút cho MỖI IP, không chia sẻ giữa các IP', async () => {
    const limiter = t.app.get(LoginRateLimiter);
    for (let i = 0; i < 10; i++) expect(await limiter.allow(ATTACKER, 'sv-a')).toBe(true);
    expect(await limiter.allow(ATTACKER, 'sv-a')).toBe(false);
    expect(await limiter.allow(VICTIM_IP, 'sv-a')).toBe(true);
    expect(await limiter.allow(ATTACKER, 'sv-b')).toBe(true); // tên khác, cùng IP: không ảnh hưởng
    t.clock.advance(minutes(10));
    expect(await limiter.allow(ATTACKER, 'sv-a')).toBe(true);
  });

  it('V1-f: trần theo tên đăng nhập cho cả hệ thống (200 mỗi 10 phút) chống đoán mật khẩu từ nhiều IP', async () => {
    const limiter = t.app.get(LoginRateLimiter);
    for (let i = 0; i < 200; i++)
      expect(await limiter.allow(`192.0.2.${i % 250}`, 'sv-b')).toBe(true);
    expect(await limiter.allow('192.0.2.250', 'sv-b')).toBe(false);
    expect(await limiter.allow('192.0.2.250', 'sv-khac')).toBe(true);
  });

  it('V1-h: lượt đã bị chặn theo cặp không được đếm vào trần theo tên: một IP không tự đẩy trần của cả hệ thống', async () => {
    const limiter = t.app.get(LoginRateLimiter);
    for (let i = 0; i < 300; i++) await limiter.allow(ATTACKER, 'sv-c'); // chỉ 10 lượt đầu được tính
    for (let i = 0; i < 190; i++) expect(await limiter.allow(`192.0.2.${i}`, 'sv-c')).toBe(true);
    expect(await limiter.allow('192.0.2.251', 'sv-c')).toBe(false); // đủ 10 + 190 = 200
  });

  it('V1-i: số lượt của mỗi cặp chỉnh được bằng LOGIN_MAX_PER_IDENTIFIER_AND_IP, trần theo tên vẫn giữ', async () => {
    const before = process.env.LOGIN_MAX_PER_IP;
    process.env.LOGIN_MAX_PER_IP = '1000'; // một IP gọi hơn 200 lượt: không để giới hạn theo IP chặn trước
    process.env.LOGIN_MAX_PER_IDENTIFIER_AND_IP = '1000';
    const relaxed = await createTestApp();
    try {
      const limiter = relaxed.app.get(LoginRateLimiter);
      for (let i = 0; i < 200; i++) expect(await limiter.allow(ATTACKER, 'sv-d')).toBe(true);
      // Nới theo cặp tới đâu thì trần 200 theo tên đăng nhập vẫn chặn.
      expect(await limiter.allow(ATTACKER, 'sv-d')).toBe(false);
    } finally {
      delete process.env.LOGIN_MAX_PER_IDENTIFIER_AND_IP;
      if (before === undefined) delete process.env.LOGIN_MAX_PER_IP;
      else process.env.LOGIN_MAX_PER_IP = before;
      await relaxed.app.close();
    }
  });

  it('V1-g: đặt lại mật khẩu bằng liên kết (7d-3 thay cho "Cấp lại mật khẩu tạm") gỡ mọi khóa theo cặp của tài khoản đó', async () => {
    await seedUser({ username: 'qt-hoi', isAdmin: true });
    const victim = await seedUser({ username: 'sv-nan-nhan' });
    const adminSession = await login(t.app, 'qt-hoi', DEFAULT_PASSWORD, '10.9.9.9');
    for (let i = 0; i < 5; i++) await wrong('sv-nan-nhan', ATTACKER);
    expect((await login(t.app, 'sv-nan-nhan', DEFAULT_PASSWORD, ATTACKER)).res.statusCode).toBe(
      429,
    );

    // Người ra đề hoặc Quản trị viên đưa Liên kết hỗ trợ; người dùng tự đặt mật khẩu mới (không ai khác biết mật khẩu).
    const created = await call(t.app, 'POST', `/api/account-support/${victim.id}/link`, {
      cookie: adminSession.cookie as string,
      body: { reason: 'Sinh viên bị khóa vì gõ sai nhiều lần' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const token = new URL(created.json().link).hash.slice(1);
    const consumed = await call(t.app, 'POST', '/api/auth/links/consume', {
      body: { purpose: 'password_reset', token, newPassword: 'hoa-sen-no-sang-moi-2026' },
    });
    expect(consumed.json().state, consumed.body).toBe('ok');

    expect(
      (await login(t.app, 'sv-nan-nhan', 'hoa-sen-no-sang-moi-2026', ATTACKER)).res.statusCode,
    ).toBe(200);
  });
});

describe('V2: trần số lần băm Argon2 chạy đồng thời', () => {
  it('V2-a: quá hàng đợi thì trả 503 SERVER_BUSY ngay, mọi yêu cầu khác trả lỗi đăng nhập bình thường, và hệ thống hồi phục', async () => {
    await seedUser({ username: 'sv-that' });
    configureHashGate({ concurrency: 1, maxQueue: 2 });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => wrong('sv-that', `10.7.0.${i + 1}`)),
    );
    const codes = results.map((r) => r.res.json().code as string);
    expect(codes.filter((c) => c === 'SERVER_BUSY').length).toBeGreaterThan(0);
    expect(codes.every((c) => c === 'SERVER_BUSY' || c === 'INVALID_CREDENTIALS')).toBe(true);
    expect(results.find((r) => r.res.json().code === 'SERVER_BUSY')?.res.statusCode).toBe(503);

    configureHashGate({ concurrency: 4, maxQueue: 400 });
    expect((await login(t.app, 'sv-that', DEFAULT_PASSWORD, '10.7.9.9')).res.statusCode).toBe(200);
  });

  it('V2-b: bị từ chối vì bận không tính là một lần sai mật khẩu (không khóa nhầm tài khoản)', async () => {
    await seedUser({ username: 'sv-that' });
    configureHashGate({ concurrency: 1, maxQueue: 0 });
    // Một yêu cầu chiếm chỗ, các yêu cầu còn lại bị từ chối vì bận: không ai bị tính sai.
    await Promise.all(Array.from({ length: 8 }, () => wrong('sv-that', ATTACKER)));
    configureHashGate({ concurrency: 4, maxQueue: 400 });
    t.clock.advance(minutes(11)); // qua cửa sổ giới hạn thử
    expect((await login(t.app, 'sv-that', DEFAULT_PASSWORD, ATTACKER)).res.statusCode).toBe(200);
  });

  it('V2-c: với hạn mức mặc định, 100 đăng nhập đúng đồng thời (đầu giờ thi) đều thành công', async () => {
    const names: string[] = [];
    for (let i = 0; i < 100; i++) {
      names.push(`sv${i}`);
      await seedUser({ username: `sv${i}` });
    }
    const results = await Promise.all(
      names.map((n, i) => login(t.app, n, DEFAULT_PASSWORD, `10.8.0.${i + 1}`)),
    );
    expect(results.every((r) => r.res.statusCode === 200)).toBe(true);
  });
});
