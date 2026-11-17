import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { csvFile } from './support/files';
import { call, login, upload } from './support/http';
import { resetState } from './support/reset';
import { fullExam } from './support/take';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// PR 7d-2, lát 7 (docs/plan/slice-7d-thiet-ke-kiem-thu.md K17): bảng theo dõi kích hoạt của Yêu cầu cấp tài khoản.

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

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const as = (who: { cookie: string }, method: 'POST' | 'GET', url: string, body?: unknown) =>
  call(t.app, method, url, { cookie: who.cookie, body });

/** Đẩy mọi thư đã xếp lùi 25 giờ: không còn là thư "vừa gửi" (luật B, 17/11/2026: bỏ qua người vừa nhận thư trong 24 giờ). */
const ageMails = () =>
  sql(
    "UPDATE email_outbox SET created_at = created_at - interval '25 hours', sent_at = sent_at - interval '25 hours'",
  );

describe('bảng theo dõi kích hoạt (K17)', () => {
  let admin: Awaited<ReturnType<typeof signedIn>>;
  let examiner: Awaited<ReturnType<typeof signedIn>>;

  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
  });

  async function approvedRequest(rows: string[], who = examiner): Promise<string> {
    const res = await upload(t.app, '/api/account-requests', csvFile(...rows), {
      cookie: who.cookie,
    });
    await t.queue.drain();
    const id = res.json().id as string;
    expect(
      (await as(admin, 'POST', `/api/account-requests/${id}/approve`, { allValid: true }))
        .statusCode,
    ).toBe(200);
    await t.queue.drain();
    return id;
  }
  const tracking = (who: { cookie: string }, requestId: string, query = '') =>
    as(who, 'GET', `/api/account-support/tracking?requestId=${requestId}${query}`);
  const stateOf = (items: { code: string; state: string }[], code: string) =>
    items.find((i) => i.code === code)?.state;

  it('D-29: sáu trạng thái tính từ email_outbox và users (Chưa gửi, Đã gửi, Thư lỗi, Cần kiểm tra, Đã kích hoạt, Email chưa xác thực)', async () => {
    const id = await approvedRequest([
      'Chưa Gửi,C1,c1@example.edu.vn,,,',
      'Đã Gửi,C2,c2@example.edu.vn,,,',
      'Thư Lỗi,C3,c3@example.edu.vn,,,',
      'Cần Kiểm,C4,c4@example.edu.vn,,,',
      'Đã Kích,C5,c5@example.edu.vn,,,',
      'Chưa Xác,C6,c6@example.edu.vn,,,',
    ]);
    const setMail = (code: string, set: string, params: unknown[] = []) =>
      sql(
        `UPDATE email_outbox SET ${set} WHERE user_id = (SELECT id FROM users WHERE code = '${code}')`,
        params,
      );
    const ago = (h: number) => new Date(t.clock.now().getTime() - h * 3_600_000);
    await setMail('C1', "status = 'pending', sent_at = NULL"); // còn trong hàng đợi
    await setMail('C3', "status = 'rejected', sent_at = NULL"); // bị từ chối ngay
    await setMail('C4', 'sent_at = $1', [ago(49)]);
    await sql(
      "UPDATE users SET password_hash = 'x', activated_at = now(), email_verified_at = now() WHERE code = 'C5'",
    );
    await sql("UPDATE users SET password_hash = 'x', activated_at = now() WHERE code = 'C6'");

    const res = await tracking(examiner, id);
    expect(res.statusCode).toBe(200);
    const items = res.json().items as { code: string; state: string }[];
    expect(stateOf(items, 'C1')).toBe('not_sent');
    expect(stateOf(items, 'C2')).toBe('sent');
    expect(stateOf(items, 'C3')).toBe('mail_failed');
    expect(stateOf(items, 'C4')).toBe('needs_check');
    expect(stateOf(items, 'C5')).toBe('activated');
    expect(stateOf(items, 'C6')).toBe('email_unverified');
  });
  it('D-29b: chỉ thư kích hoạt quyết định trạng thái (thư loại khác gần hơn bị từ chối không làm đổi)', async () => {
    const id = await approvedRequest(['Khác Loại,K1,k1@example.edu.vn,,,']);
    await sql(
      `INSERT INTO email_outbox (id, kind, lane, to_email, user_id, status, next_attempt_at, created_at)
       SELECT gen_random_uuid(), 'password_reset', 'urgent', email, id, 'rejected', now(), now() + interval '1 hour'
         FROM users WHERE code = 'K1'`,
    );
    const items = (await tracking(examiner, id)).json().items as { state: string }[];
    expect(items[0]?.state).toBe('sent');
  });

  it('D-30: "Cần kiểm tra" đúng mốc 48 giờ kể từ lần gửi thành công', async () => {
    const id = await approvedRequest(['Mốc,M1,m1@example.edu.vn,,,']);
    const sentAt = (offsetMs: number) =>
      sql('UPDATE email_outbox SET sent_at = $1', [
        new Date(t.clock.now().getTime() - 48 * 3_600_000 + offsetMs),
      ]);
    const state = async () =>
      ((await tracking(examiner, id)).json().items as { state: string }[])[0]?.state;

    await sentAt(1_000); // mới gửi 47 giờ 59 phút 59 giây trước
    expect(await state()).toBe('sent');
    await sentAt(-1_000); // đã gửi 48 giờ 00 phút 01 giây trước
    expect(await state()).toBe('needs_check');
  });

  it('D-31: Người ra đề chỉ xem Yêu cầu của mình (người khác 404), Quản trị viên xem mọi Yêu cầu, Người dự thi bị chặn', async () => {
    const id = await approvedRequest(['Của Tôi,T1,t1@example.edu.vn,,,']);
    const other = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên Khác' });
    const candidate = await signedIn({ roleTags: ['candidate'], fullName: 'Thí Sinh' });

    expect((await tracking(examiner, id)).statusCode).toBe(200);
    expect((await tracking(admin, id)).statusCode).toBe(200);
    expect((await tracking(other, id)).statusCode).toBe(404);
    expect((await tracking(candidate, id)).statusCode).toBe(403);
    expect((await tracking(examiner, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });

  it('D-32: phân trang và lọc theo trạng thái; số đếm theo trạng thái tính trên toàn Yêu cầu', async () => {
    const id = await approvedRequest(
      Array.from(
        { length: 5 },
        (_, i) => `Sinh Viên ${i + 1},P${i + 1},p${i + 1}@example.edu.vn,,,`,
      ),
    );
    await sql(
      "UPDATE users SET password_hash = 'x', activated_at = now(), email_verified_at = now() WHERE code IN ('P1','P2')",
    );

    const page1 = (await tracking(examiner, id, '&pageSize=2&page=1')).json();
    expect(page1.items).toHaveLength(2);
    expect(page1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(page1.counts).toMatchObject({ activated: 2, sent: 3, not_sent: 0 });
    const page3 = (await tracking(examiner, id, '&pageSize=2&page=3')).json();
    expect(page3.items).toHaveLength(1);

    const filtered = (await tracking(examiner, id, '&state=activated')).json();
    expect(filtered.total).toBe(2);
    expect(filtered.items.every((i: { state: string }) => i.state === 'activated')).toBe(true);
    expect(filtered.counts.sent).toBe(3); // số đếm không đổi theo bộ lọc
    expect((await tracking(examiner, id, '&state=bậy')).statusCode).toBe(400);
  });

  it('D-33: 500 dòng trả lời dưới 300 ms', async () => {
    const id = await approvedRequest(
      Array.from(
        { length: 500 },
        (_, i) => `Sinh Viên ${i + 1},Q${i + 1},q${i + 1}@example.edu.vn,,,`,
      ),
    );
    await call(t.app, 'GET', `/api/account-support/tracking?requestId=${id}`, {
      cookie: examiner.cookie,
    }); // làm nóng
    const started = performance.now();
    const res = await tracking(examiner, id, '&pageSize=50');
    const took = performance.now() - started;
    expect(res.json().total).toBe(500);
    expect(took).toBeLessThan(300);
  });
  it('D-32b: nhóm lọc "Chờ kích hoạt" gom Chưa gửi, Đã gửi, Thư lỗi, Cần kiểm tra (quyết định A)', async () => {
    const id = await approvedRequest([
      'A,G1,g1@example.edu.vn,,,',
      'B,G2,g2@example.edu.vn,,,',
      'C,G3,g3@example.edu.vn,,,',
    ]);
    await sql(
      "UPDATE users SET password_hash = 'x', activated_at = now(), email_verified_at = now() WHERE code = 'G1'",
    );
    await sql("UPDATE users SET password_hash = 'x', activated_at = now() WHERE code = 'G2'");
    const res = (await tracking(examiner, id, '&group=awaiting')).json();
    expect(res.items.map((i: { code: string }) => i.code)).toEqual(['G3']);
    expect((await tracking(examiner, id, '&group=awaiting&state=sent')).statusCode).toBe(400);
  });

  describe('Gửi lại cho tất cả (D-34 đến D-36)', () => {
    const resendAll = (who: { cookie: string }, requestId: string) =>
      as(who, 'POST', '/api/account-support/resend-all', { requestId });

    it('D-34: chỉ xếp thư cho người còn Chờ kích hoạt và đủ điều kiện, báo số bỏ qua', async () => {
      const id = await approvedRequest([
        'Đã Kích,H1,h1@example.edu.vn,,,',
        'Vừa Gửi Lại,H2,h2@example.edu.vn,,,',
        'Cần Nhắc 1,H3,h3@example.edu.vn,,,',
        'Cần Nhắc 2,H4,h4@example.edu.vn,,,',
      ]);
      await sql(
        "UPDATE users SET password_hash = 'x', activated_at = now(), email_verified_at = now() WHERE code = 'H1'",
      );
      await ageMails(); // thư tạo tài khoản đã cũ; riêng H2 được Gửi lại ngay bên dưới nên là thư "vừa gửi"
      const [h2] = await sql<{ id: string }>("SELECT id FROM users WHERE code = 'H2'");
      expect((await as(admin, 'POST', `/api/account-support/${h2?.id}/resend`)).statusCode).toBe(
        200,
      );
      await t.queue.drain();
      t.mail.reset();

      const res = await resendAll(examiner, id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ queued: 2, skipped: 2, recent: 1 });
      await t.queue.drain();
      expect(t.mail.sent.map((m) => m.to).sort()).toEqual([
        'h3@example.edu.vn',
        'h4@example.edu.vn',
      ]);
      const lanes = await sql<{ lane: string; requested_by: string }>(
        "SELECT DISTINCT lane, requested_by FROM email_outbox WHERE status = 'sent' AND to_email IN ('h3@example.edu.vn','h4@example.edu.vn') AND created_at = (SELECT max(created_at) FROM email_outbox o WHERE o.user_id = email_outbox.user_id)",
      );
      expect(lanes).toEqual([{ lane: 'bulk', requested_by: examiner.id }]);
    });

    it('D-35: lần hai trong 6 giờ bị từ chối kèm giờ được thử lại; Quản trị viên không bị giới hạn 6 giờ', async () => {
      const id = await approvedRequest(['K,J1,j1@example.edu.vn,,,']);
      await ageMails();
      expect((await resendAll(examiner, id)).statusCode).toBe(200);
      const again = await resendAll(examiner, id);
      expect(again.statusCode).toBe(429);
      expect(again.json().details?.allowedAt ?? again.json().allowedAt).toBeDefined();

      // Quản trị viên bỏ qua giới hạn 6 giờ (vẫn tôn trọng 24 giờ mỗi sinh viên).
      const byAdmin = await resendAll(admin, id);
      expect(byAdmin.statusCode).toBe(200);
      expect(byAdmin.json()).toEqual({ queued: 0, skipped: 1, recent: 1 });
    });

    it('D-35d: Quản trị viên gọi liên tiếp hai lần đều được (không bị giới hạn 6 giờ)', async () => {
      const id = await approvedRequest(['Q,V1,v1@example.edu.vn,,,']);
      expect((await resendAll(admin, id)).statusCode).toBe(200);
      expect((await resendAll(admin, id)).statusCode).toBe(200);
    });

    it('D-35b: không có ai đủ điều kiện thì không tốn lượt 6 giờ của Người ra đề', async () => {
      const id = await approvedRequest(['L,N1,n1@example.edu.vn,,,']);
      await sql(
        "UPDATE users SET password_hash = 'x', activated_at = now(), email_verified_at = now()",
      );
      expect((await resendAll(examiner, id)).json()).toEqual({
        queued: 0,
        skipped: 1,
        recent: 0,
      });
      await sql(
        "UPDATE users SET password_hash = NULL, activated_at = NULL, email_verified_at = NULL WHERE code = 'N1'",
      );
      expect((await resendAll(examiner, id)).statusCode).toBe(200);
    });

    // Luật B (17/11/2026): "Gửi lại cho tất cả" bỏ qua người vừa nhận thư kích hoạt trong 24 giờ (kể cả thư tạo hoặc khôi phục),
    // vì thư mới làm liên kết trong thư cũ hết hiệu lực và tốn gấp đôi hạn mức Gmail.
    it('R-17: ngay sau khi duyệt, "Gửi lại cho tất cả" không gửi thêm cho người vừa nhận thư tạo tài khoản', async () => {
      const id = await approvedRequest(['A,V1,v1@example.edu.vn,,,', 'B,V2,v2@example.edu.vn,,,']);
      t.mail.reset();
      const res = await resendAll(examiner, id);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ queued: 0, skipped: 2, recent: 2 });
      await t.queue.drain();
      expect(t.mail.sent).toEqual([]);
      // Không ai được gửi nên không mất lượt 6 giờ của Người ra đề.
      await ageMails();
      expect((await resendAll(examiner, id)).json()).toEqual({ queued: 2, skipped: 0, recent: 0 });
    });

    it('R-18: chỉ người đã nhận thư quá 24 giờ mới được gửi lại; người vừa nhận thì bỏ qua', async () => {
      const id = await approvedRequest([
        'Cũ,V3,v3@example.edu.vn,,,',
        'Mới,V4,v4@example.edu.vn,,,',
      ]);
      await sql(
        "UPDATE email_outbox SET created_at = created_at - interval '25 hours', sent_at = sent_at - interval '25 hours' WHERE to_email = 'v3@example.edu.vn'",
      );
      t.mail.reset();
      const res = await resendAll(examiner, id);
      expect(res.json()).toEqual({ queued: 1, skipped: 1, recent: 1 });
      await t.queue.drain();
      expect(t.mail.sent.map((m) => m.to)).toEqual(['v3@example.edu.vn']);
    });

    it('R-19: thư vừa gửi mà bị từ chối hoặc lỗi thì KHÔNG tính là "vừa gửi": vẫn gửi lại được', async () => {
      const id = await approvedRequest(['Lỗi,V5,v5@example.edu.vn,,,']);
      await sql("UPDATE email_outbox SET status = 'rejected', sent_at = NULL");
      t.mail.reset();
      expect((await resendAll(examiner, id)).json()).toEqual({ queued: 1, skipped: 0, recent: 0 });
    });

    it('R-20: thư vừa xếp mà chưa gửi đi (đang chờ) cũng tính là "vừa gửi"', async () => {
      const id = await approvedRequest(['Chờ,V6,v6@example.edu.vn,,,']);
      await sql("UPDATE email_outbox SET status = 'pending', sent_at = NULL");
      expect((await resendAll(examiner, id)).json()).toEqual({ queued: 0, skipped: 1, recent: 1 });
    });

    it('D-35c: Người ra đề khác hoặc Người dự thi không gửi lại hộ được', async () => {
      const id = await approvedRequest(['M,O1,o1@example.edu.vn,,,']);
      const other = await signedIn({ roleTags: ['examiner'], fullName: 'Khác' });
      const candidate = await signedIn({ roleTags: ['candidate'], fullName: 'Thí Sinh' });
      expect((await resendAll(other, id)).statusCode).toBe(404);
      expect((await resendAll(candidate, id)).statusCode).toBe(403);
    });

    it('D-36: hai Người ra đề cùng bấm: thư xoay vòng giữa hai lớp', async () => {
      const other = await signedIn({ roleTags: ['examiner'], fullName: 'Hai Giảng Viên' });
      const a = await approvedRequest([
        'A1,R1,a1@example.edu.vn,,,',
        'A2,R2,a2@example.edu.vn,,,',
        'A3,R3,a3@example.edu.vn,,,',
      ]);
      const b = await approvedRequest(
        ['B1,S1,b1@example.edu.vn,,,', 'B2,S2,b2@example.edu.vn,,,'],
        other,
      );
      await sql('UPDATE users SET password_hash = NULL'); // giữ nguyên Chờ kích hoạt
      await sql('DELETE FROM email_outbox');
      await sql('DELETE FROM auth_tokens');
      t.mail.reset();
      await sql('UPDATE users SET created_at = created_at'); // no-op, giữ thứ tự
      expect((await resendAll(examiner, a)).statusCode).toBe(200);
      expect((await resendAll(other, b)).statusCode).toBe(200);
      await t.queue.drain();
      t.clock.advance(5 * 60_000);
      await t.queue.drain();
      expect(t.mail.sent.map((m) => m.to.charAt(0)).slice(0, 4)).toEqual(['a', 'b', 'a', 'b']);
      expect(t.mail.sent).toHaveLength(5);
    });
  });
  describe('theo Phiên thi (D-31b)', () => {
    async function sessionWith(userIds: string[], who = examiner): Promise<string> {
      const examId = (await fullExam(t, who.cookie)).id;
      const now = t.clock.now().getTime();
      const created = await as(who, 'POST', '/api/sessions', {
        examId,
        title: 'Ca theo dõi',
        opensAt: new Date(now + minutes(60)).toISOString(),
        closesAt: new Date(now + minutes(240)).toISOString(),
        durationMinutes: 45,
        accessCode: 'AB3K9X',
      });
      expect(created.statusCode, created.body).toBe(201);
      const id = created.json().id as string;
      const added = await as(who, 'POST', `/api/sessions/${id}/roster`, { userIds });
      expect(added.statusCode, added.body).toBeLessThan(300);
      return id;
    }
    const bySession = (who: { cookie: string }, sessionId: string, query = '') =>
      as(who, 'GET', `/api/account-support/tracking?sessionId=${sessionId}${query}`);

    it('D-31b: Danh sách dự thi của Phiên thi mình hiện trạng thái kích hoạt; người khác 404, Quản trị viên xem được', async () => {
      const waiting = await seedUser({
        pending: true,
        email: 'cho@example.edu.vn',
        roleTags: ['candidate'],
        fullName: 'Đang Chờ',
      });
      const active = await seedUser({
        email: 'dung@example.edu.vn',
        roleTags: ['candidate'],
        fullName: 'Đã Dùng',
      });
      await sql('UPDATE users SET email_verified_at = now() WHERE id = $1', [active.id]);
      const id = await sessionWith([waiting.id, active.id]);

      const res = await bySession(examiner, id);
      expect(res.statusCode, res.body).toBe(200);
      const byName = Object.fromEntries(
        (res.json().items as { fullName: string; state: string }[]).map((i) => [
          i.fullName,
          i.state,
        ]),
      );
      expect(byName).toEqual({ 'Đang Chờ': 'not_sent', 'Đã Dùng': 'activated' });
      expect(res.json().counts).toMatchObject({ not_sent: 1, activated: 1 });

      const other = await signedIn({ roleTags: ['examiner'], fullName: 'Người Khác' });
      expect((await bySession(other, id)).statusCode).toBe(404);
      expect((await bySession(admin, id)).statusCode).toBe(200);
      expect((await as(examiner, 'GET', '/api/account-support/tracking')).statusCode).toBe(400);
      expect(
        (await as(examiner, 'GET', `/api/account-support/tracking?sessionId=${id}&requestId=${id}`))
          .statusCode,
      ).toBe(400);
    });

    // P3 (docs/plan/yeu-cau-nhieu-giang-vien-thiet-ke.md): dòng sinh viên do người khác tạo chỉ hiện trạng thái, không có nút.
    async function sharedStudent() {
      const other = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên Khác' });
      // Giảng viên khác (A) xin cấp và được duyệt trước: tài khoản do A tạo.
      await approvedRequest(['Sinh Viên Chung,CH01,ch01@example.edu.vn,,,'], other);
      // `examiner` (B) gửi cùng sinh viên sau khi đã có tài khoản: "khớp có sẵn", chỉ gắn nhãn.
      const id = await approvedRequest(['Sinh Viên Chung,CH01,ch01@example.edu.vn,,,']);
      const [student] = await sql<{ id: string }>("SELECT id FROM users WHERE code = 'CH01'");
      return { id, studentId: student?.id as string };
    }

    it('R-14: dòng sinh viên do người khác tạo hiện trạng thái nhưng không thao tác được; "Gửi lại cho tất cả" không gửi cho họ; Quản trị viên thao tác được', async () => {
      const { id, studentId } = await sharedStudent();
      t.mail.reset();

      const board = (await tracking(examiner, id)).json();
      expect(board.items).toHaveLength(1);
      expect(board.items[0]).toMatchObject({ userId: studentId, state: 'sent', actionable: false });

      const all = await as(examiner, 'POST', '/api/account-support/resend-all', { requestId: id });
      expect(all.json()).toEqual({ queued: 0, skipped: 1, recent: 0 });
      await t.queue.drain();
      expect(t.mail.sent).toEqual([]);
      expect(
        (await as(examiner, 'POST', `/api/account-support/${studentId}/resend`)).statusCode,
      ).toBe(404); // quyền từng người vẫn như cũ

      const forAdmin = (await tracking(admin, id)).json();
      expect(forAdmin.items[0]).toMatchObject({ actionable: true });
    });

    it('R-15: sinh viên đang trong Danh sách dự thi chưa kết thúc của mình thì thao tác được và được gửi lại hàng loạt', async () => {
      const { id, studentId } = await sharedStudent();
      await sessionWith([studentId]);
      await ageMails();
      const board = (await tracking(examiner, id)).json();
      expect(board.items[0]).toMatchObject({ actionable: true });
      const all = await as(examiner, 'POST', '/api/account-support/resend-all', { requestId: id });
      expect(all.json()).toEqual({ queued: 1, skipped: 0, recent: 0 });
    });

    it('R-16: sinh viên do chính mình tạo hoặc khôi phục thì thao tác được', async () => {
      const id = await approvedRequest(['Của Tôi,CT01,ct01@example.edu.vn,,,']);
      expect((await tracking(examiner, id)).json().items[0]).toMatchObject({ actionable: true });
    });
  });
});
