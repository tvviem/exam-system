import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { csvFile } from './support/files';
import { call, login, type UploadFile, upload } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// Yêu cầu khi nhiều giảng viên dạy chung lớp và khớp với tài khoản đã Xóa (docs/plan/yeu-cau-nhieu-giang-vien-thiet-ke.md):
// R-01 đến R-11 khôi phục tài khoản đã Xóa (C-gọn), R-12 và R-13 duyệt đồng thời (P2).

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
type Who = Awaited<ReturnType<typeof signedIn>>;
const get = (who: { cookie: string }, url: string) =>
  call(t.app, 'GET', url, { cookie: who.cookie });
const post = (who: { cookie: string }, url: string, body?: unknown) =>
  call(t.app, 'POST', url, { cookie: who.cookie, body });

async function submitted(who: Who, file: UploadFile): Promise<string> {
  const res = await upload(t.app, '/api/account-requests', file, { cookie: who.cookie });
  expect(res.statusCode).toBe(201);
  await t.queue.drain();
  return res.json().id;
}
// biome-ignore lint/suspicious/noExplicitAny: dòng JSON của API, mỗi bài đọc vài trường
type Row = Record<string, any>;
const itemsOf = async (who: Who, id: string) =>
  (await get(who, `/api/account-requests/${id}/items?pageSize=100`)).json().items as Row[];
const firstOf = async (who: Who, id: string) => (await itemsOf(who, id))[0] as Row;
const approveAll = async (admin: Who, id: string, body: unknown = { allValid: true }) => {
  const res = await post(admin, `/api/account-requests/${id}/approve`, body);
  expect(res.statusCode, res.body).toBe(200);
  await t.queue.drain();
};
const removedBy = (userId: string, adminId: string) =>
  sql("UPDATE users SET removed_by = $2, removed_at = now() - interval '3 days' WHERE id = $1", [
    userId,
    adminId,
  ]);

describe('khớp tài khoản đã Xóa: khôi phục (C-gọn)', () => {
  let admin: Who;
  let examiner: Who;
  beforeEach(async () => {
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị Viên' });
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
  });

  async function removedStudent(extra: SeedUser = {}) {
    const user = await seedUser({
      fullName: 'Nguyễn Văn An',
      code: 'SV01',
      email: 'an@example.edu.vn',
      classLabel: 'K21',
      roleTags: ['candidate'],
      removed: true,
      ...extra,
    });
    await removedBy(user.id, admin.id);
    return user;
  }

  it('R-01: dòng khớp tài khoản đã Xóa chỉ có nhãn Người dự thi là "khôi phục", chưa bị từ chối', async () => {
    const old = await removedStudent();
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an.moi@example.edu.vn,,,'));
    const item = await firstOf(admin, id);
    expect(item).toMatchObject({
      matchStatus: 'restore',
      outcome: 'pending',
      outcomeNote: 'will_restore',
    });
    expect(item.matchedUser.id).toBe(old.id);
  });

  it('R-02: tài khoản đã Xóa từng là Quản trị viên hoặc có vai trò khác thì vẫn bị chặn, Quản trị viên vẫn thấy tài khoản bị khớp', async () => {
    const wasAdmin = await seedUser({
      isAdmin: true,
      removed: true,
      code: 'QT1',
      email: 'qt1@example.edu.vn',
      fullName: 'Cựu Quản Trị',
    });
    const wasExaminer = await seedUser({
      roleTags: ['examiner', 'candidate'],
      removed: true,
      code: 'GV1',
      email: 'gv1@example.edu.vn',
      fullName: 'Cựu Giảng Viên',
    });
    const id = await submitted(
      examiner,
      csvFile('Cựu Quản Trị,QT1,qt1@example.edu.vn,,,', 'Cựu Giảng Viên,GV1,gv1@example.edu.vn,,,'),
    );
    const items = await itemsOf(admin, id);
    expect(items.map((i) => [i.matchStatus, i.outcome, i.outcomeNote])).toEqual([
      ['blocked', 'rejected', 'removed_user_privileged'],
      ['blocked', 'rejected', 'removed_user_privileged'],
    ]);
    expect(items.map((i) => i.matchedUser?.id)).toEqual([wasAdmin.id, wasExaminer.id]);
  });

  it('R-03: mã thuộc người đã Xóa mà email thuộc người đang dùng vẫn bị chặn (không khôi phục nhầm)', async () => {
    await removedStudent();
    await seedUser({ email: 'dang.dung@example.edu.vn', fullName: 'Người Đang Dùng' });
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,dang.dung@example.edu.vn,,,'));
    const item = await firstOf(admin, id);
    expect(item).toMatchObject({ matchStatus: 'blocked', outcomeNote: 'code_email_conflict' });
  });

  it('R-04: có cả tài khoản đang dùng lẫn đã Xóa thì khớp tài khoản đang dùng, không khôi phục', async () => {
    await removedStudent();
    const active = await seedUser({
      fullName: 'Nguyễn Văn An',
      code: 'SV01',
      email: 'an@example.edu.vn',
      roleTags: ['candidate'],
    });
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an@example.edu.vn,,,'));
    const item = await firstOf(admin, id);
    expect(item).toMatchObject({ matchStatus: 'exact' });
    expect(item.matchedUser.id).toBe(active.id);
  });

  it('R-05: "Duyệt các dòng hợp lệ" KHÔNG duyệt dòng khôi phục; chọn riêng thì duyệt được', async () => {
    await removedStudent();
    const id = await submitted(
      examiner,
      csvFile('Phạm Mới,B500,moi@example.edu.vn,,,', 'Nguyễn Văn An,SV01,an@example.edu.vn,,,'),
    );
    const detail = (await get(admin, `/api/account-requests/${id}`)).json();
    expect(detail.counts).toEqual({ new: 1, exact: 0, name_mismatch: 0, restore: 1, blocked: 0 });
    expect(detail.pendingValid).toBe(1);

    await approveAll(admin, id);
    let items = await itemsOf(admin, id);
    expect(items.map((i) => [i.matchStatus, i.outcome])).toEqual([
      ['new', 'created'],
      ['restore', 'pending'],
    ]);
    expect((await get(admin, `/api/account-requests/${id}`)).json().status).toBe('pending');

    await approveAll(admin, id, { approveItemIds: [items[1]?.id] });
    items = await itemsOf(admin, id);
    expect(items[1]).toMatchObject({ outcome: 'restored' });
    expect((await get(admin, `/api/account-requests/${id}`)).json().status).toBe('approved');
  });

  it('R-06: duyệt khôi phục giữ nguyên tài khoản (cùng id, tên, mã), về Chờ kích hoạt, email lấy từ file, một thư kích hoạt, có nhật ký', async () => {
    const old = await removedStudent();
    await sql("UPDATE users SET status = 'locked', locked_reason = 'x' WHERE id = $1", [old.id]);
    const id = await submitted(
      examiner,
      csvFile('Tên Trong File,SV01,an.moi@example.edu.vn,K22,,'),
    );
    const item = await firstOf(admin, id);
    await approveAll(admin, id, { approveItemIds: [item?.id] });

    const users = await sql<Record<string, unknown>>(
      `SELECT id, full_name, code, email, class_label, status::text AS status, removed_at, removed_by, password_hash,
              activated_at, email_verified_at, must_change_password,
              (SELECT array_agg(tag::text) FROM user_role_tags WHERE user_id = u.id) AS tags
         FROM users u`,
    );
    const restored = users.find((u) => u.id === old.id);
    expect(users.filter((u) => u.code === 'SV01')).toHaveLength(1); // không tạo dòng thứ hai
    expect(restored).toMatchObject({
      full_name: 'Nguyễn Văn An', // giữ tên cũ
      code: 'SV01',
      email: 'an.moi@example.edu.vn', // email lấy từ file
      status: 'active',
      removed_at: null,
      removed_by: null,
      password_hash: null, // Chờ kích hoạt
      activated_at: null,
      email_verified_at: null,
      tags: ['candidate'],
    });

    const mails = await sql<{ kind: string; lane: string; to_email: string; requested_by: string }>(
      'SELECT kind, lane, to_email, requested_by FROM email_outbox',
    );
    expect(mails).toEqual([
      {
        kind: 'activation',
        lane: 'bulk',
        to_email: 'an.moi@example.edu.vn',
        requested_by: examiner.id,
      },
    ]);
    const done = (await itemsOf(admin, id))[0];
    expect(done).toMatchObject({ outcome: 'restored' });
    expect(done?.matchedUser.id).toBe(old.id);
    const audit = await sql<{ action: string; entity_id: string }>(
      "SELECT action, entity_id FROM audit_logs WHERE action = 'user.restore'",
    );
    expect(audit).toEqual([{ action: 'user.restore', entity_id: old.id }]);
  });

  it('R-07: liên kết còn hiệu lực của tài khoản cũ chết khi khôi phục', async () => {
    const old = await removedStudent();
    await sql(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, 'support_link', 'hash-cu', now() + interval '1 hour', now())`,
      [old.id],
    );
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an@example.edu.vn,,,'));
    await approveAll(admin, id, { approveItemIds: [(await itemsOf(admin, id))[0]?.id] });
    const [token] = await sql<{ replaced_at: Date | null }>(
      "SELECT replaced_at FROM auth_tokens WHERE token_hash = 'hash-cu'",
    );
    expect(token?.replaced_at).not.toBeNull();
  });

  it('R-08: trong lúc chờ duyệt có người chiếm email thì dòng bị bỏ qua và tài khoản vẫn đã Xóa', async () => {
    const old = await removedStudent();
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an.moi@example.edu.vn,,,'));
    await seedUser({ email: 'an.moi@example.edu.vn', fullName: 'Người Khác' });
    await approveAll(admin, id, { approveItemIds: [(await itemsOf(admin, id))[0]?.id] });
    const item = await firstOf(admin, id);
    expect(item).toMatchObject({ outcome: 'skipped', outcomeNote: 'email_taken' });
    const [row] = await sql<{ removed_at: Date | null }>(
      'SELECT removed_at FROM users WHERE id = $1',
      [old.id],
    );
    expect(row?.removed_at).not.toBeNull();
    expect(t.mail.sent).toEqual([]);
  });

  it('R-09: sinh viên được khôi phục kích hoạt bằng liên kết trong thư và đăng nhập; lịch sử cũ vẫn thuộc đúng tài khoản', async () => {
    const old = await removedStudent({ username: 'sv01' });
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an@example.edu.vn,,,'));
    await approveAll(admin, id, { approveItemIds: [(await itemsOf(admin, id))[0]?.id] });
    await t.queue.drain();
    const mail = t.mail.sent.find((m) => m.to === 'an@example.edu.vn');
    const link = new URL(mail?.text.match(/https?:\/\/[^\s<>"')]+/)?.[0] as string);
    expect(link.pathname).toBe('/activate');
    const consumed = await call(t.app, 'POST', '/api/auth/links/consume', {
      body: {
        purpose: 'activation',
        token: link.hash.slice(1),
        newPassword: 'hoa-sen-no-sang-moi-2026',
      },
    });
    expect(consumed.json().state).toBe('ok');
    const again = await login(t.app, 'sv01', 'hoa-sen-no-sang-moi-2026');
    expect(again.res.statusCode).toBe(200);
    const me = await call(t.app, 'GET', '/api/auth/me', { cookie: again.cookie as string });
    expect(me.json().id).toBe(old.id);
  });

  it('R-10: Quản trị viên thấy chi tiết đối chiếu (khớp theo gì, trạng thái đã Xóa lúc nào bởi ai, vai trò); Người ra đề không thấy', async () => {
    const old = await removedStudent();
    const id = await submitted(examiner, csvFile('Nguyễn Văn An,SV01,an.moi@example.edu.vn,,,'));
    const forAdmin = await firstOf(admin, id);
    expect(forAdmin.matchedUser).toMatchObject({
      id: old.id,
      fullName: 'Nguyễn Văn An',
      code: 'SV01',
      email: 'an@example.edu.vn',
      classLabel: 'K21',
      status: 'removed',
      removedByName: 'Quản Trị Viên',
      roleTags: ['candidate'],
      isAdmin: false,
      matchedBy: 'code', // email trong file khác email cũ
    });
    expect(typeof forAdmin.matchedUser.removedAt).toBe('string');

    const forExaminer = await firstOf(examiner, id);
    expect(forExaminer.matchedUser).toBeNull();
    expect(forExaminer.outcomeNote).toBe('restore_awaiting_admin'); // trung tính, không lộ chi tiết
    expect(JSON.stringify(forExaminer)).not.toContain('Quản Trị Viên');
  });

  it('R-11: khớp theo email thì ghi "email", khớp cả hai thì ghi "cả mã và email"; tài khoản đang dùng cũng có chi tiết', async () => {
    await removedStudent();
    const active = await seedUser({
      fullName: 'Trần Thị Bình',
      code: 'SV02',
      email: 'binh@example.edu.vn',
      roleTags: ['candidate'],
    });
    const id = await submitted(
      examiner,
      csvFile(
        'Nguyễn Văn An,,an@example.edu.vn,,,', // chỉ email khớp tài khoản đã Xóa
        'Trần Thị Bình,SV02,binh@example.edu.vn,,,', // cả hai khớp tài khoản đang dùng
      ),
    );
    const [byEmail, both] = (await itemsOf(admin, id)) as [Row, Row];
    expect(byEmail.matchedUser.matchedBy).toBe('email');
    expect(both.matchedUser).toMatchObject({
      id: active.id,
      matchedBy: 'code_email',
      status: 'active',
      removedAt: null,
    });
  });
});

describe('hai Yêu cầu cùng một sinh viên mới (P2)', () => {
  it('R-12: duyệt lần lượt, dòng của Yêu cầu thứ hai thành "khớp có sẵn" (gắn nhãn), không "bỏ qua", không thư thứ hai', async () => {
    const admin = await signedIn({ isAdmin: true });
    const a = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên A' });
    const b = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên B' });
    const file = csvFile('Sinh Viên Chung,CH01,ch01@example.edu.vn,,,');
    const first = await submitted(a, file);
    const second = await submitted(b, file); // cả hai đều thấy "Người mới" vì chưa ai được duyệt
    expect((await itemsOf(admin, second))[0]).toMatchObject({ matchStatus: 'new' });

    await approveAll(admin, first);
    await approveAll(admin, second);

    const item = await firstOf(admin, second);
    expect(item).toMatchObject({ outcome: 'tag_added' });
    expect(await sql("SELECT 1 FROM users WHERE code = 'CH01'")).toHaveLength(1);
    expect(item?.matchedUser?.id).toBe(
      (await sql<{ id: string }>("SELECT id FROM users WHERE code = 'CH01'"))[0]?.id,
    );
    expect(t.mail.sent.filter((m) => m.to === 'ch01@example.edu.vn')).toHaveLength(1);
    expect((await get(admin, `/api/account-requests/${second}`)).json().status).toBe('approved');
  });

  it('R-13: họ tên khác hẳn thì vẫn "bỏ qua" kèm lý do (không tự gộp hai người)', async () => {
    const admin = await signedIn({ isAdmin: true });
    const a = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên A' });
    const b = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên B' });
    const first = await submitted(a, csvFile('Sinh Viên Chung,CH01,ch01@example.edu.vn,,,'));
    const second = await submitted(b, csvFile('Một Người Khác Hẳn,CH01,ch01@example.edu.vn,,,'));
    await approveAll(admin, first);
    await approveAll(admin, second);
    const item = await firstOf(admin, second);
    expect(item).toMatchObject({ outcome: 'skipped' });
    expect(['code_taken', 'email_taken', 'username_taken']).toContain(item?.outcomeNote);
  });
});
