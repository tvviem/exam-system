import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { captureLogs } from './support/capture-logs';
import { sql } from './support/db';
import { days, minutes } from './support/fake-clock';
import { csvFile } from './support/files';
import { call, login, upload } from './support/http';
import { resetState } from './support/reset';
import { fullExam } from './support/take';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// PR 7d-1 (docs/plan/slice-7d-thiet-ke-kiem-thu.md K16): Gửi lại, Sửa email, Liên kết hỗ trợ qua HTTP với `MailService`
// THẬT + bộ dựng thư THẬT + vận chuyển giả.

let t: TestApp;
const NEW_PASSWORD = 'hoa-sen-no-sang-moi-2026';

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

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const as = (
  who: { cookie: string },
  method: 'POST' | 'GET' | 'PATCH',
  url: string,
  body?: unknown,
) => call(t.app, method, url, { cookie: who.cookie, body });

function linkIn(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  const url = new URL(urls[0] as string);
  return { path: url.pathname, token: url.hash.slice(1) };
}
const statusOf = (purpose: string, token: string) =>
  call(t.app, 'POST', '/api/auth/links/status', { body: { purpose, token } });
const consume = (purpose: string, token: string, newPassword = NEW_PASSWORD) =>
  call(t.app, 'POST', '/api/auth/links/consume', { body: { purpose, token, newPassword } });

describe('hỗ trợ kích hoạt (K16)', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  /** Tài khoản Chờ kích hoạt do Yêu cầu của `examiner` tạo (đi hết luồng duyệt thật). */
  let student: { id: string; email: string };

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
    const res = await upload(
      t.app,
      '/api/account-requests',
      csvFile('Sinh Viên Một,SV1,sv1@example.edu.vn,,,'),
      {
        cookie: examiner.cookie,
      },
    );
    await t.queue.drain();
    await as(admin, 'POST', `/api/account-requests/${res.json().id}/approve`, { allValid: true });
    await t.queue.drain();
    const [row] = await sql<{ id: string }>("SELECT id FROM users WHERE code = 'SV1'");
    student = { id: row?.id as string, email: 'sv1@example.edu.vn' };
  });

  const sentTo = (email: string) => t.mail.sent.filter((m) => m.to === email);

  describe('Gửi lại (D-08 đến D-12)', () => {
    const resend = (who: { cookie: string }, userId = student.id) =>
      as(who, 'POST', `/api/account-support/${userId}/resend`);

    it('D-08: Quản trị viên gửi lại: xếp thư kích hoạt mới (làn khẩn, người xếp là Quản trị viên); liên kết cũ chết khi thư mới được dựng', async () => {
      const first = linkIn(sentTo(student.email)[0]?.text as string);
      t.mail.reset();

      expect((await resend(admin)).statusCode).toBe(200);
      const [queued] = await sql<{ kind: string; lane: string; requested_by: string }>(
        "SELECT kind, lane, requested_by FROM email_outbox WHERE status = 'pending'",
      );
      expect(queued).toEqual({ kind: 'activation', lane: 'urgent', requested_by: admin.id });
      await t.queue.drain();

      const second = linkIn(sentTo(student.email)[0]?.text as string);
      expect(second.token).not.toBe(first.token);
      expect((await statusOf('activation', first.token)).json().state).toBe('replaced');
      expect((await statusOf('activation', second.token)).json().state).toBe('ok');
    });

    it('D-08b: Người ra đề gửi lại cho sinh viên của Yêu cầu mình: làn hàng loạt', async () => {
      t.mail.reset();
      expect((await resend(examiner)).statusCode).toBe(200);
      const [queued] = await sql<{ lane: string; requested_by: string }>(
        "SELECT lane, requested_by FROM email_outbox WHERE status = 'pending'",
      );
      expect(queued).toEqual({ lane: 'bulk', requested_by: examiner.id });
    });

    it('D-09: lần hai trong 24 giờ bị từ chối kèm giờ được gửi lại; sau 24 giờ gửi được', async () => {
      expect((await resend(admin)).statusCode).toBe(200);
      const again = await resend(examiner);
      expect(again.statusCode).toBe(429);
      expect(again.json()).toMatchObject({ code: 'RATE_LIMITED' });
      expect(new Date(again.json().allowedAt).getTime()).toBe(t.clock.now().getTime() + days(1));
      t.clock.advance(days(1) + minutes(1));
      const adminAgain = (await login(t.app, admin.username as string, DEFAULT_PASSWORD))
        .cookie as string;
      expect((await resend({ cookie: adminAgain })).statusCode).toBe(200);
    });

    it('D-10: tài khoản Hoạt động có email chưa xác thực: Gửi lại là thư xác thực tới chính email đó', async () => {
      const active = await seedUser({ email: 'hd@example.edu.vn', roleTags: ['candidate'] });
      t.mail.reset();
      expect((await resend(admin, active.id)).statusCode).toBe(200);
      await t.queue.drain();
      expect(t.mail.sent.map((m) => [m.to, linkIn(m.text).path])).toEqual([
        ['hd@example.edu.vn', '/verify-email'],
      ]);
    });

    it('D-11: tài khoản Hoạt động đã xác thực: không còn gì để gửi lại (409)', async () => {
      const active = await seedUser({ email: 'ok@example.edu.vn', emailVerified: true });
      const res = await resend(admin, active.id);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOTHING_TO_RESEND' });
    });

    it('D-12: nhật ký ghi ai gửi lại cho ai, không chứa mã', async () => {
      await resend(admin);
      await t.queue.drain();
      const logs = (
        await as(
          admin,
          'GET',
          `/api/admin/audit-logs?entityId=${student.id}&action=account-support.resend`,
        )
      ).json().items;
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ actorName: 'Quản Trị', action: 'account-support.resend' });
      const token = linkIn(sentTo(student.email).at(-1)?.text as string).token;
      expect(JSON.stringify(logs)).not.toContain(token);
    });

    it('D-03: sinh viên Chờ kích hoạt trong Danh sách dự thi của Phiên thi chưa kết thúc của mình được hỗ trợ; Phiên thi kết thúc rồi thì hết quyền (Q384)', async () => {
      const listed = await seedUser({
        pending: true,
        email: 'ds@example.edu.vn',
        roleTags: ['candidate'],
      });
      expect((await resend(examiner, listed.id)).statusCode).toBe(404); // chưa có quan hệ nào
      const examId = (await fullExam(t, examiner.cookie)).id;
      const now = t.clock.now().getTime();
      const created = await as(examiner, 'POST', '/api/sessions', {
        examId,
        title: 'Ca thử',
        opensAt: new Date(now + minutes(60)).toISOString(),
        closesAt: new Date(now + minutes(240)).toISOString(),
        durationMinutes: 45,
        accessCode: 'AB3K9X',
      });
      expect(created.statusCode, created.body).toBe(201);
      const added = await as(examiner, 'POST', `/api/sessions/${created.json().id}/roster`, {
        userIds: [listed.id],
      });
      expect(added.statusCode, added.body).toBeLessThan(300);

      expect((await resend(examiner, listed.id)).statusCode).toBe(200);
      t.clock.advance(minutes(300)); // Phiên thi đã kết thúc
      const examinerAgain = (await login(t.app, examiner.username as string, DEFAULT_PASSWORD))
        .cookie as string;
      const after = await as(
        { cookie: examinerAgain },
        'POST',
        `/api/account-support/${listed.id}/email`,
        {
          email: 'moi@example.edu.vn',
          reason: 'x',
        },
      );
      expect(after.statusCode).toBe(404);
    });

    it('D-05/D-06/D-07 qua HTTP: quyền của Người ra đề và Quản trị viên', async () => {
      const other = await seedUser({
        pending: true,
        email: 'khac@example.edu.vn',
        roleTags: ['candidate'],
      });
      const locked = await seedUser({ pending: true, email: 'lk@example.edu.vn' });
      await sql("UPDATE users SET status = 'locked' WHERE id = $1", [locked.id]);
      const removed = await seedUser({ pending: true, email: 'rm@example.edu.vn' });
      await sql('UPDATE users SET removed_at = now() WHERE id = $1', [removed.id]);
      const activeFriend = await seedUser({ email: 'af@example.edu.vn', roleTags: ['candidate'] });
      const candidate = await signedIn({ roleTags: ['candidate'] });

      // Người ra đề: không thuộc Yêu cầu của mình → 404 (không cho dò xem tài khoản có tồn tại không)
      expect((await resend(examiner, other.id)).statusCode).toBe(404);
      expect((await resend(examiner, '0198f0f0-0000-7000-8000-000000000000')).statusCode).toBe(404);
      expect((await resend(examiner, removed.id)).statusCode).toBe(404);
      expect((await resend(examiner, admin.id)).statusCode).toBe(403);
      expect((await resend(candidate)).statusCode).toBe(403);
      // Tài khoản Hoạt động không phải Chờ kích hoạt, Người ra đề không được
      const notPending = await resend(examiner, activeFriend.id);
      expect(notPending.statusCode).toBe(409);
      expect(notPending.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_PENDING' });
      // Bị Khóa: không ai, kể cả Quản trị viên
      expect((await resend(admin, locked.id)).statusCode).toBe(409);
      expect((await resend(admin, removed.id)).statusCode).toBe(404);
      expect(await sql("SELECT 1 FROM email_outbox WHERE status = 'pending'")).toHaveLength(0);
    });
  });

  describe('Sửa email (D-13 đến D-18)', () => {
    const change = (who: { cookie: string }, body: unknown, userId = student.id) =>
      as(who, 'POST', `/api/account-support/${userId}/email`, body);

    it('D-13: Chờ kích hoạt: email đổi ngay, liên kết cũ chết, thư kích hoạt mới tới email mới, thư chưa gửi tới email cũ bị hủy', async () => {
      // Dựng lại cảnh: thư kích hoạt cho email cũ còn đang chờ (chưa gửi), kèm một liên kết cũ đã gửi lần trước.
      const old = linkIn(sentTo(student.email)[0]?.text as string);
      await as(admin, 'POST', `/api/account-support/${student.id}/resend`);
      t.mail.reset();

      const res = await change(admin, { email: 'moi@example.edu.vn', reason: 'Gõ nhầm email' });
      expect(res.statusCode).toBe(200);
      const [row] = await sql<{ email: string; email_verified_at: Date | null }>(
        'SELECT email, email_verified_at FROM users WHERE id = $1',
        [student.id],
      );
      expect(row).toEqual({ email: 'moi@example.edu.vn', email_verified_at: null });
      expect((await statusOf('activation', old.token)).json().state).toBe('replaced');

      await t.queue.drain();
      expect(sentTo(student.email)).toEqual([]); // thư đang chờ cho email cũ đã bị hủy
      const mails = sentTo('moi@example.edu.vn');
      expect(mails).toHaveLength(1);
      expect(linkIn(mails[0]?.text as string).path).toBe('/activate');
    });

    it('D-14: Hoạt động (chỉ Quản trị viên): email mới chưa xác thực, thư xác thực tới email mới, thư báo tới email cũ không có liên kết', async () => {
      const active = await seedUser({
        email: 'cu@example.edu.vn',
        emailVerified: true,
        roleTags: ['candidate'],
      });
      t.mail.reset();
      const res = await change(
        admin,
        { email: 'moi2@example.edu.vn', reason: 'Đổi theo yêu cầu' },
        active.id,
      );
      expect(res.statusCode).toBe(200);
      const [row] = await sql<{ email: string; email_verified_at: Date | null }>(
        'SELECT email, email_verified_at FROM users WHERE id = $1',
        [active.id],
      );
      expect(row).toEqual({ email: 'moi2@example.edu.vn', email_verified_at: null });
      await t.queue.drain();

      const verify = sentTo('moi2@example.edu.vn');
      expect(verify).toHaveLength(1);
      expect(linkIn(verify[0]?.text as string).path).toBe('/verify-email');
      const notice = sentTo('cu@example.edu.vn');
      expect(notice).toHaveLength(1);
      expect(notice[0]?.text).not.toMatch(/https?:\/\//); // thư báo không mang liên kết
    });

    it('D-15: lý do bắt buộc; email sai định dạng hoặc trùng email hiện tại bị từ chối', async () => {
      expect((await change(admin, { email: 'moi@example.edu.vn' })).statusCode).toBe(400);
      expect((await change(admin, { email: 'moi@example.edu.vn', reason: '   ' })).statusCode).toBe(
        400,
      );
      expect((await change(admin, { email: 'khong-phai', reason: 'x' })).statusCode).toBe(400);
      expect((await change(admin, { email: student.email, reason: 'x' })).statusCode).toBe(400);
    });

    it('D-16: email mới trùng tài khoản chưa Xóa bị từ chối (409, trường email); không đổi, không gửi thư', async () => {
      await seedUser({ email: 'chiem@example.edu.vn' });
      t.mail.reset();
      const res = await change(admin, { email: 'chiem@example.edu.vn', reason: 'x' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ code: 'CONFLICT', field: 'email' });
      const [row] = await sql<{ email: string }>('SELECT email FROM users WHERE id = $1', [
        student.id,
      ]);
      expect(row?.email).toBe(student.email);
      expect(await sql("SELECT 1 FROM email_outbox WHERE status = 'pending'")).toHaveLength(0);
    });

    it('D-17: Người ra đề sửa email của sinh viên Chờ kích hoạt thuộc Yêu cầu của mình (có lý do); không sửa được tài khoản khác hay đã Hoạt động', async () => {
      const ok = await change(examiner, {
        email: 'moi3@example.edu.vn',
        reason: 'Sinh viên báo gõ nhầm',
      });
      expect(ok.statusCode).toBe(200);
      const other = await seedUser({ pending: true, email: 'khac@example.edu.vn' });
      expect(
        (await change(examiner, { email: 'x@example.edu.vn', reason: 'x' }, other.id)).statusCode,
      ).toBe(404);
      const active = await seedUser({ email: 'hd@example.edu.vn' });
      expect(
        (await change(examiner, { email: 'y@example.edu.vn', reason: 'x' }, active.id)).statusCode,
      ).toBe(409);
    });

    it('D-18: nhật ký ghi email cũ, mới và lý do; không chứa mã', async () => {
      await change(admin, { email: 'moi4@example.edu.vn', reason: 'Gõ nhầm email' });
      await t.queue.drain();
      const logs = (
        await as(
          admin,
          'GET',
          `/api/admin/audit-logs?entityId=${student.id}&action=account-support.email-change`,
        )
      ).json().items;
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorName: 'Quản Trị',
        after: {
          previousEmail: student.email,
          newEmail: 'moi4@example.edu.vn',
          reason: 'Gõ nhầm email',
        },
      });
      const token = linkIn(sentTo('moi4@example.edu.vn')[0]?.text as string).token;
      expect(JSON.stringify(logs)).not.toContain(token);
    });

    it('D-18b: PATCH người dùng không còn đổi email trực tiếp (phải qua Sửa email có lý do)', async () => {
      const res = await as(admin, 'PATCH', `/api/admin/users/${student.id}`, {
        email: 'tat@example.edu.vn',
      });
      expect(res.statusCode).toBe(400);
      const [row] = await sql<{ email: string }>('SELECT email FROM users WHERE id = $1', [
        student.id,
      ]);
      expect(row?.email).toBe(student.email);
    });
  });

  describe('Liên kết hỗ trợ (D-19 đến D-24)', () => {
    const makeLink = (who: { cookie: string }, body: unknown, userId = student.id) =>
      as(who, 'POST', `/api/account-support/${userId}/link`, body);

    it('D-19: tạo cho tài khoản Chờ kích hoạt: liên kết /activate#mã hiện một lần, hạn 60 phút, lý do bắt buộc', async () => {
      expect((await makeLink(admin, {})).statusCode).toBe(400);
      expect((await makeLink(admin, { reason: ' ' })).statusCode).toBe(400);
      const res = await makeLink(admin, { reason: 'Thư không tới, sinh viên có mặt' });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.purpose).toBe('activation');
      expect(new Date(body.expiresAt).getTime()).toBe(t.clock.now().getTime() + minutes(60));
      const url = new URL(body.link);
      expect(url.pathname).toBe('/activate');
      expect(url.hash.slice(1).length).toBeGreaterThan(30);
    });

    it('D-20: dùng liên kết hỗ trợ đặt được mật khẩu; tài khoản Hoạt động nhưng email CHƯA xác thực; đăng nhập được', async () => {
      const { link } = (await makeLink(admin, { reason: 'Thư không tới' })).json();
      const token = new URL(link).hash.slice(1);
      expect((await statusOf('activation', token)).json().state).toBe('ok');
      expect((await consume('activation', token)).json().state).toBe('ok');
      const [row] = await sql<{
        activated_at: Date | null;
        email_verified_at: Date | null;
        has_password: boolean;
      }>(
        'SELECT activated_at, email_verified_at, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1',
        [student.id],
      );
      expect(row?.activated_at).not.toBeNull();
      expect(row?.has_password).toBe(true);
      expect(row?.email_verified_at).toBeNull(); // chưa chứng minh được hộp thư (Q377)
      expect((await login(t.app, 'sv1', NEW_PASSWORD)).res.statusCode).toBe(200);
      // Dùng lần hai thì báo đã dùng.
      expect((await consume('activation', token)).json().state).toBe('used');
    });

    it('D-21: tạo cho tài khoản Hoạt động: liên kết /reset-password; người dùng tự đặt mật khẩu, phiên cũ bị thu hồi, có thư báo "mật khẩu đã đổi"', async () => {
      const active = await signedIn({
        email: 'hd@example.edu.vn',
        emailVerified: true,
        roleTags: ['candidate'],
      });
      const res = await makeLink(admin, { reason: 'Mất quyền vào email' }, active.id);
      expect(res.statusCode).toBe(201);
      expect(res.json().purpose).toBe('password_reset');
      const token = new URL(res.json().link).hash.slice(1);
      expect(new URL(res.json().link).pathname).toBe('/reset-password');

      t.mail.reset();
      expect((await consume('password_reset', token)).json().state).toBe('ok');
      expect((await call(t.app, 'GET', '/api/auth/me', { cookie: active.cookie })).statusCode).toBe(
        401,
      );
      await t.queue.drain();
      expect(t.mail.sent.map((m) => m.to)).toEqual(['hd@example.edu.vn']);
      expect((await login(t.app, active.username as string, NEW_PASSWORD)).res.statusCode).toBe(
        200,
      );
    });

    it('D-22: tạo mới làm liên kết hỗ trợ cũ chết; thư kích hoạt đang chờ không làm hỏng liên kết hỗ trợ', async () => {
      const first = new URL((await makeLink(admin, { reason: 'lần 1' })).json().link).hash.slice(1);
      const second = new URL((await makeLink(admin, { reason: 'lần 2' })).json().link).hash.slice(
        1,
      );
      expect((await statusOf('activation', first)).json().state).toBe('replaced');
      expect((await statusOf('activation', second)).json().state).toBe('ok');
      // Thư kích hoạt (cấp mã loại activation) được dựng sau đó: không làm liên kết hỗ trợ chết.
      await as(admin, 'POST', `/api/account-support/${student.id}/resend`);
      await t.queue.drain();
      expect((await statusOf('activation', second)).json().state).toBe('ok');
    });

    it('D-20b: sinh viên kích hoạt bằng liên kết thường thì liên kết hỗ trợ còn lại chết (không để sót liên kết đặt lại mật khẩu)', async () => {
      const support = new URL(
        (await makeLink(admin, { reason: 'phòng hờ' })).json().link,
      ).hash.slice(1);
      const normal = linkIn(sentTo(student.email)[0]?.text as string).token;
      expect((await consume('activation', normal)).json().state).toBe('ok');
      expect((await statusOf('password_reset', support)).json().state).toBe('replaced');
      expect(
        (await consume('password_reset', support, 'mat-khau-ke-tan-cong-1')).json().state,
      ).toBe('replaced');
      expect((await login(t.app, 'sv1', 'mat-khau-ke-tan-cong-1')).res.statusCode).toBe(401);
    });

    it('D-23: hết hạn đúng mốc 60 phút', async () => {
      const token = new URL((await makeLink(admin, { reason: 'x' })).json().link).hash.slice(1);
      t.clock.advance(minutes(60) - 1);
      expect((await statusOf('activation', token)).json().state).toBe('ok');
      t.clock.advance(1);
      expect((await statusOf('activation', token)).json().state).toBe('expired');
    });

    it('D-19b: Người ra đề tạo cho sinh viên Chờ kích hoạt của mình; không tạo cho tài khoản khác hay đã Hoạt động', async () => {
      expect(
        (await makeLink(examiner, { reason: 'Sinh viên có mặt, thư chưa tới' })).statusCode,
      ).toBe(201);
      const other = await seedUser({ pending: true, email: 'khac@example.edu.vn' });
      expect((await makeLink(examiner, { reason: 'x' }, other.id)).statusCode).toBe(404);
      const active = await seedUser({ email: 'hd@example.edu.vn' });
      expect((await makeLink(examiner, { reason: 'x' }, active.id)).statusCode).toBe(409);
    });

    it('D-25b: mỗi người tạo tối đa 30 Liên kết hỗ trợ mỗi giờ (429), giờ sau tạo lại được', async () => {
      for (let i = 0; i < 30; i++) {
        expect((await makeLink(admin, { reason: `lần ${i}` })).statusCode).toBe(201);
      }
      const blocked = await makeLink(admin, { reason: 'lần 31' });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ code: 'RATE_LIMITED' });
      // Người ra đề có hạn mức riêng, không bị ảnh hưởng.
      expect((await makeLink(examiner, { reason: 'của tôi' })).statusCode).toBe(201);
      t.clock.advance(minutes(61));
      const adminAgain = (await login(t.app, admin.username as string, DEFAULT_PASSWORD))
        .cookie as string;
      expect((await makeLink({ cookie: adminAgain }, { reason: 'giờ sau' })).statusCode).toBe(201);
    });

    it('D-24: mã chỉ nằm trong phản hồi: không ở nhật ký, auth_tokens (chỉ băm), email_outbox, log', async () => {
      let token = '';
      const logs = await captureLogs(async () => {
        const res = await makeLink(admin, { reason: 'Thư không tới' });
        token = new URL(res.json().link).hash.slice(1);
        await consume('activation', token);
        await t.queue.drain();
      });
      expect(token.length).toBeGreaterThan(30);
      expect(logs.join('\n')).not.toContain(token);
      const like = `%${token}%`;
      const checks: [string, unknown[]][] = [
        ['SELECT 1 FROM audit_logs WHERE before::text LIKE $1 OR after::text LIKE $1', [like]],
        ['SELECT 1 FROM auth_tokens WHERE token_hash = $1 OR reason LIKE $2', [token, like]],
        [
          'SELECT 1 FROM email_outbox WHERE to_email LIKE $1 OR context::text LIKE $1 OR last_error LIKE $1',
          [like],
        ],
        ['SELECT 1 FROM notifications WHERE data::text LIKE $1', [like]],
      ];
      for (const [query, params] of checks) expect(await sql(query, params)).toHaveLength(0);
      const logsAudit = (
        await as(
          admin,
          'GET',
          `/api/admin/audit-logs?entityId=${student.id}&action=account-support.link`,
        )
      ).json().items;
      expect(logsAudit).toHaveLength(1);
      expect(logsAudit[0].after).toMatchObject({ purpose: 'activation', reason: 'Thư không tới' });
    });
  });
});

describe('danh sách người dùng: trạng thái kích hoạt (D-25)', () => {
  it('lọc "chưa kích hoạt", "email chưa xác thực", "thư lỗi"; mỗi dòng trả trạng thái kích hoạt và xác thực email', async () => {
    const admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    const pendingUser = await seedUser({
      pending: true,
      email: 'p@example.edu.vn',
      fullName: 'Chờ Một',
    });
    const unverified = await seedUser({ email: 'u@example.edu.vn', fullName: 'Chưa Xác Thực' });
    const fine = await seedUser({
      email: 'f@example.edu.vn',
      emailVerified: true,
      fullName: 'Ổn Cả',
    });
    const bounced = await seedUser({
      pending: true,
      email: 'loi@example.edu.vn',
      fullName: 'Thư Lỗi',
    });
    await sql(
      `INSERT INTO email_outbox (id, kind, lane, to_email, user_id, status, next_attempt_at, created_at)
       VALUES (gen_random_uuid(), 'activation', 'bulk', 'loi@example.edu.vn', $1, 'rejected', now(), now())`,
      [bounced.id],
    );
    const ids = async (query: string) =>
      (
        (
          await call(t.app, 'GET', `/api/admin/users?pageSize=100${query}`, {
            cookie: admin.cookie,
          })
        ).json().items as { id: string }[]
      )
        .map((i) => i.id)
        .sort();

    expect(await ids('&activation=pending')).toEqual([pendingUser.id, bounced.id].sort());
    // Quản trị viên đăng nhập trong test cũng chưa xác thực email nên có mặt ở danh sách này.
    expect(await ids('&activation=unverified')).toEqual([unverified.id, admin.id].sort());
    expect(await ids('&activation=mail_failed')).toEqual([bounced.id]);
    expect(
      (await call(t.app, 'GET', '/api/admin/users?activation=bogus', { cookie: admin.cookie }))
        .statusCode,
    ).toBe(400); // giá trị lạ bị từ chối, không âm thầm trả hết
    const all = (
      await call(t.app, 'GET', '/api/admin/users?pageSize=100', { cookie: admin.cookie })
    ).json().items as { id: string; pending: boolean; emailVerified: boolean }[];
    const byId = new Map(all.map((i) => [i.id, i]));
    expect(byId.get(pendingUser.id)).toMatchObject({ pending: true, emailVerified: false });
    expect(byId.get(unverified.id)).toMatchObject({ pending: false, emailVerified: false });
    expect(byId.get(fine.id)).toMatchObject({ pending: false, emailVerified: true });
  });
});

describe('chuông khi đặt lại mật khẩu của Người ra đề hoặc Quản trị viên (D-27)', () => {
  async function resetViaEmail(username: string) {
    t.mail.reset();
    await call(t.app, 'POST', '/api/auth/forgot-password', { body: { identifier: username } });
    await t.queue.drain();
    const text = t.mail.sent.find((m) => /reset-password/.test(m.text))?.text as string;
    const token = new URL(text.match(/https?:\/\/[^\s<>"')]+/)?.[0] as string).hash.slice(1);
    const res = await consume('password_reset', token);
    expect(res.json().state).toBe('ok');
  }
  const bells = async (who: { cookie: string }) =>
    (
      (await call(t.app, 'GET', '/api/notifications', { cookie: who.cookie })).json().items as {
        type: string;
        data: Record<string, unknown>;
      }[]
    ).filter((n) => n.type === 'account.password_reset_by_email');

  it('đặt lại mật khẩu của Người ra đề: các Quản trị viên khác nhận chuông (kèm tên), chính người đó thì không', async () => {
    const adminA = await signedIn({ isAdmin: true, fullName: 'Quản Trị A' });
    const adminB = await signedIn({ isAdmin: true, fullName: 'Quản Trị B' });
    await seedUser({
      username: 'gv',
      roleTags: ['examiner'],
      email: 'gv@example.edu.vn',
      emailVerified: true,
      fullName: 'Lê Giảng Viên',
    });
    await resetViaEmail('gv');
    for (const admin of [adminA, adminB]) {
      const items = await bells(admin);
      expect(items).toHaveLength(1);
      expect(items[0]?.data).toMatchObject({ name: 'Lê Giảng Viên' });
    }
  });

  it('Quản trị viên tự đặt lại mật khẩu: các Quản trị viên KHÁC nhận chuông, chính mình thì không', async () => {
    const adminA = await signedIn({
      isAdmin: true,
      fullName: 'Quản Trị A',
      email: 'a@example.edu.vn',
      emailVerified: true,
    });
    const adminB = await signedIn({ isAdmin: true, fullName: 'Quản Trị B' });
    await resetViaEmail(adminA.username as string);
    expect(await bells(adminB)).toHaveLength(1);
    const adminAAgain = (await login(t.app, adminA.username as string, NEW_PASSWORD))
      .cookie as string;
    expect(await bells({ cookie: adminAAgain })).toHaveLength(0);
  });

  it('Người dự thi đặt lại mật khẩu: không có chuông', async () => {
    const admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    await seedUser({
      username: 'sv',
      roleTags: ['candidate'],
      email: 'sv@example.edu.vn',
      emailVerified: true,
    });
    await resetViaEmail('sv');
    expect(await bells(admin)).toHaveLength(0);
  });
});
