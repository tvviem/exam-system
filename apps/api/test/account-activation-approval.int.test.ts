import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { csvFile } from './support/files';
import { call, login, type UploadFile, upload } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// PR 7c-2a, lát 7 (docs/plan/slice-7c2-thiet-ke-kiem-thu.md K9): duyệt Yêu cầu cấp tài khoản chỉ tạo tài khoản
// "Chờ kích hoạt" và xếp một thư kích hoạt mỗi người (không mật khẩu tạm, không Phiếu tài khoản). Dùng `MailService`
// THẬT + bộ dựng thư THẬT của `identity` + vận chuyển giả.

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
  t.slips.calls.length = 0;
});

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const post = (cookie: string, url: string, body?: unknown) =>
  call(t.app, 'POST', url, { cookie, body });

function linkIn(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  expect(urls).toHaveLength(1);
  const url = new URL(urls[0] as string);
  return { path: url.pathname, token: url.hash.slice(1) };
}

describe('duyệt Yêu cầu tạo tài khoản Chờ kích hoạt (K9)', () => {
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  let admin: Awaited<ReturnType<typeof signedIn>>;

  beforeEach(async () => {
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });

  async function pendingRequest(file: UploadFile, cookie = examiner.cookie): Promise<string> {
    const res = await upload(t.app, '/api/account-requests', file, { cookie });
    expect(res.statusCode).toBe(201);
    await t.queue.drain();
    return res.json().id;
  }
  const approve = (id: string, body: unknown = { allValid: true }) =>
    post(admin.cookie, `/api/account-requests/${id}/approve`, body);
  async function approved(id: string, body: unknown = { allValid: true }) {
    expect((await approve(id, body)).statusCode).toBe(200);
    await t.queue.drain();
  }

  it('B-22: duyệt một dòng mới tạo tài khoản KHÔNG mật khẩu, chưa kích hoạt, không mật khẩu tạm, không Phiếu', async () => {
    const id = await pendingRequest(csvFile('Phạm Mới,B500,moi@example.edu.vn,K21,15/03/2005,Nam'));
    await approved(id);

    const [user] = await sql<Record<string, unknown>>(
      `SELECT username, email, code, full_name, class_label, password_hash, activated_at, email_verified_at,
              password_expires_at, status, created_by,
              (SELECT array_agg(tag::text) FROM user_role_tags WHERE user_id = u.id) AS tags
         FROM users u WHERE code = 'B500'`,
    );
    expect(user).toMatchObject({
      username: 'b500',
      email: 'moi@example.edu.vn',
      full_name: 'Phạm Mới',
      class_label: 'K21',
      password_hash: null,
      activated_at: null,
      email_verified_at: null,
      password_expires_at: null,
      created_by: admin.id,
      tags: ['candidate'],
    });
    expect(await sql('SELECT 1 FROM credential_slips')).toHaveLength(0);
    expect(t.slips.calls).toHaveLength(0);
    // Không còn thông tin phiếu mã hóa nằm lại trong kho tệp.
    const reply = await call(t.app, 'GET', `/api/account-requests/${id}`, { cookie: admin.cookie });
    expect(reply.json()).not.toHaveProperty('slipId');
  });

  it('B-22b: không có mã định danh thì tên đăng nhập là email', async () => {
    const id = await pendingRequest(csvFile('Lê Hai,,hai@example.edu.vn,,,'));
    await approved(id);
    const [user] = await sql<{ username: string; password_hash: string | null }>(
      "SELECT username, password_hash FROM users WHERE email = 'hai@example.edu.vn'",
    );
    expect(user).toEqual({ username: 'hai@example.edu.vn', password_hash: null });
  });

  it('B-23: mỗi dòng mới xếp đúng MỘT thư kích hoạt (làn hàng loạt, người xếp là Người ra đề tạo Yêu cầu)', async () => {
    const id = await pendingRequest(
      csvFile('An,B1,an@example.edu.vn,,,', 'Bình,B2,binh@example.edu.vn,,,'),
    );
    await approved(id);

    const rows = await sql<{ kind: string; lane: string; requested_by: string; to_email: string }>(
      'SELECT kind, lane, requested_by, to_email FROM email_outbox ORDER BY to_email',
    );
    expect(rows).toEqual([
      {
        kind: 'activation',
        lane: 'bulk',
        requested_by: examiner.id,
        to_email: 'an@example.edu.vn',
      },
      {
        kind: 'activation',
        lane: 'bulk',
        requested_by: examiner.id,
        to_email: 'binh@example.edu.vn',
      },
    ]);
    // Mỗi thư gắn đúng tài khoản vừa tạo.
    const linked = await sql(
      `SELECT 1 FROM email_outbox o JOIN users u ON u.id = o.user_id AND lower(u.email) = lower(o.to_email)`,
    );
    expect(linked).toHaveLength(2);
  });

  it('B-24: người đã có tài khoản (khớp mã) giữ nguyên email, thêm nhãn, KHÔNG nhận thư', async () => {
    const an = await seedUser({
      fullName: 'Nguyễn Văn An',
      code: 'B100',
      email: 'cu@example.edu.vn',
    });
    const id = await pendingRequest(csvFile('Nguyễn Văn An,B100,moi-khac@example.edu.vn,,,'));
    await approved(id);

    const [row] = await sql<{ email: string; tags: string[] }>(
      `SELECT email, (SELECT array_agg(tag::text) FROM user_role_tags WHERE user_id = u.id) AS tags
         FROM users u WHERE id = $1`,
      [an.id],
    );
    expect(row?.email).toBe('cu@example.edu.vn');
    expect(row?.tags).toEqual(['candidate']);
    expect(await sql('SELECT 1 FROM email_outbox')).toHaveLength(0);
  });

  it('B-24b: người đã có tài khoản (khớp email) cũng không nhận thư', async () => {
    await seedUser({ fullName: 'Trần Thị Bình', email: 'binh@example.edu.vn' });
    const id = await pendingRequest(csvFile('Trần Thị Bình,,binh@example.edu.vn,,,'));
    await approved(id);
    expect(await sql('SELECT 1 FROM email_outbox')).toHaveLength(0);
  });

  it('B-25: duyệt 300 dòng xếp 300 thư, API phản hồi dưới 300 ms', async () => {
    const lines = Array.from(
      { length: 300 },
      (_, i) => `Sinh Viên ${i + 1},SV${i + 1},sv${i + 1}@example.edu.vn,,,`,
    );
    const id = await pendingRequest(csvFile(...lines));
    const started = performance.now();
    expect((await approve(id)).statusCode).toBe(200);
    expect(performance.now() - started).toBeLessThan(300);
    await t.queue.drain();
    const [row] = await sql<{ n: string }>(
      "SELECT count(*)::text AS n FROM email_outbox WHERE kind = 'activation'",
    );
    expect(row?.n).toBe('300');
  });

  it('B-26: thư gửi dần theo hạn mức và xoay vòng giữa hai Người ra đề', async () => {
    const other = await signedIn({ roleTags: ['examiner'], fullName: 'Hai Giảng Viên' });
    const first = await pendingRequest(
      csvFile(
        'A1,A1,a1@example.edu.vn,,,',
        'A2,A2,a2@example.edu.vn,,,',
        'A3,A3,a3@example.edu.vn,,,',
      ),
    );
    const second = await pendingRequest(
      csvFile('B1,B1,b1@example.edu.vn,,,', 'B2,B2,b2@example.edu.vn,,,'),
      other.cookie,
    );
    // Cả hai lớp cùng chờ gửi trước khi worker bắt đầu gửi, để thấy việc xoay vòng.
    expect((await approve(first)).statusCode).toBe(200);
    expect((await approve(second)).statusCode).toBe(200);
    await t.queue.drain();
    t.clock.advance(minutes(5));
    await t.queue.drain();

    const order = t.mail.sent.map((m) => m.to.charAt(0));
    expect(order.slice(0, 4)).toEqual(['a', 'b', 'a', 'b']); // xoay vòng, không để một lớp chiếm hết
    expect(t.mail.sent).toHaveLength(5);
  });

  it('B-27: sinh viên kích hoạt bằng liên kết trong thư rồi đăng nhập được, email đã xác thực', async () => {
    const id = await pendingRequest(csvFile('Phạm Mới,B500,moi@example.edu.vn,,,'));
    await approved(id);
    await t.queue.drain();
    const sent = t.mail.sent.find((m) => m.to === 'moi@example.edu.vn');
    expect(sent).toBeDefined();
    const link = linkIn(sent?.text as string);
    expect(link.path).toBe('/activate');

    const res = await call(t.app, 'POST', '/api/auth/links/consume', {
      body: { purpose: 'activation', token: link.token, newPassword: NEW_PASSWORD },
    });
    expect(res.json().state).toBe('ok');
    expect((await login(t.app, 'b500', NEW_PASSWORD)).res.statusCode).toBe(200);
    const [user] = await sql<{ activated_at: Date | null; email_verified_at: Date | null }>(
      "SELECT activated_at, email_verified_at FROM users WHERE code = 'B500'",
    );
    expect(user?.activated_at).not.toBeNull();
    expect(user?.email_verified_at).not.toBeNull();
  });

  it('B-28: dòng bị từ chối không tạo gì và không gửi thư', async () => {
    await seedUser({ isAdmin: true, email: 'qt@example.edu.vn', fullName: 'Quản Trị Khác' });
    const id = await pendingRequest(
      csvFile('Quản Trị Khác,,qt@example.edu.vn,,,', 'Mới Hợp Lệ,M1,hl@example.edu.vn,,,'),
    );
    await approved(id);
    expect(t.mail.sent.map((m) => m.to)).toEqual(['hl@example.edu.vn']);
    expect(await sql("SELECT 1 FROM users WHERE code = 'M1'")).toHaveLength(1);
  });

  it('B-29b: trong lúc chờ duyệt có người chiếm email thì dòng bị bỏ qua và không gửi thư', async () => {
    const id = await pendingRequest(csvFile('Phạm Mới,B500,moi@example.edu.vn,,,'));
    await seedUser({ fullName: 'Người Khác', email: 'moi@example.edu.vn', username: 'nguoi.khac' });
    await approved(id);
    expect(await sql("SELECT 1 FROM users WHERE code = 'B500'")).toHaveLength(0);
    expect(t.mail.sent).toEqual([]);
  });
});
