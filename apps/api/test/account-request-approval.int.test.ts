import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_STORE, type MediaStore } from '../src/media/media-store';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { FAKE_PDF, FAKE_XLSX } from './support/capturing-slip-renderer';
import { sql } from './support/db';
import { days, minutes } from './support/fake-clock';
import { csvFile } from './support/files';
import { call, login, type UploadFile, upload } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.slips.calls.length = 0;
});

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const get = (cookie: string, url: string) => call(t.app, 'GET', url, { cookie });
const post = (cookie: string, url: string, body?: unknown) =>
  call(t.app, 'POST', url, { cookie, body });

interface Item {
  id: string;
  rowNumber: number;
  matchStatus: string;
  outcome: string;
  outcomeNote: string | null;
}
const itemsOf = async (cookie: string, id: string): Promise<Item[]> =>
  (await get(cookie, `/api/account-requests/${id}/items?pageSize=100`)).json().items;
const statusOf = async (cookie: string, id: string): Promise<string> =>
  (await get(cookie, `/api/account-requests/${id}`)).json().status;
const outcomes = (items: Item[]) => items.map((i) => [i.rowNumber, i.outcome, i.outcomeNote]);

describe('duyệt Yêu cầu cấp tài khoản (PR 1e)', () => {
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  let admin: Awaited<ReturnType<typeof signedIn>>;

  beforeEach(async () => {
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });

  /** Người ra đề gửi file, worker đọc xong: yêu cầu "chờ duyệt". */
  async function pending(file: UploadFile): Promise<string> {
    const res = await upload(t.app, '/api/account-requests', file, { cookie: examiner.cookie });
    expect(res.statusCode).toBe(201);
    await t.queue.drain();
    return res.json().id;
  }
  const approve = (id: string, body: unknown, cookie = admin.cookie) =>
    post(cookie, `/api/account-requests/${id}/approve`, body);
  /** Quản trị viên duyệt, worker xử lý xong. */
  async function approved(id: string, body: unknown) {
    const res = await approve(id, body);
    expect(res.statusCode).toBe(200);
    await t.queue.drain();
    return res;
  }
  const advance = async (ms: number) => {
    t.clock.advance(ms);
    admin.cookie = (await login(t.app, admin.username as string, DEFAULT_PASSWORD))
      .cookie as string;
    examiner.cookie = (await login(t.app, examiner.username as string, DEFAULT_PASSWORD))
      .cookie as string;
  };

  describe('tạo tài khoản, thêm vai trò, bỏ qua, từ chối', () => {
    it('duyệt cả lô hợp lệ: tạo tài khoản mới, thêm vai trò cho người có sẵn, để yên dòng khác họ tên', async () => {
      const an = await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const binh = await seedUser({ fullName: 'Trần Thị Bình', email: 'binh@example.edu.vn' });
      await seedUser({ isAdmin: true, email: 'qt@example.edu.vn' });
      const id = await pending(
        csvFile(
          'Nguyễn Văn An,B100,,,,', // exact
          'Phạm Mới,B500,,K21,15/03/2005,Nam', // new, có mã
          'Lê Hai,,hai@example.edu.vn,,,', // new, chỉ có email
          'Khác Tên,,binh@example.edu.vn,,,', // name_mismatch
          'Quản Trị,,qt@example.edu.vn,,,', // blocked
        ),
      );

      const res = await approve(id, { allValid: true });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('approving');
      expect(await sql('SELECT 1 FROM users WHERE code = $1', ['B500'])).toHaveLength(0);

      await t.queue.drain();
      expect(outcomes(await itemsOf(admin.cookie, id))).toEqual([
        [2, 'tag_added', null],
        [3, 'created', null],
        [4, 'created', null],
        [5, 'pending', null],
        [6, 'rejected', 'matches_admin'],
      ]);
      // Còn dòng khác họ tên chưa quyết nên yêu cầu quay về "chờ duyệt".
      expect(await statusOf(admin.cookie, id)).toBe('pending');

      const [moi] = await sql<Record<string, unknown>>(
        `SELECT u.username, u.email, u.full_name, u.class_label, u.date_of_birth::text AS dob, u.gender,
                u.must_change_password, u.password_expires_at, u.created_by,
                (SELECT array_agg(tag::text) FROM user_role_tags WHERE user_id = u.id) AS tags
           FROM users u WHERE u.code = 'B500'`,
      );
      expect(moi).toMatchObject({
        username: 'b500',
        email: null,
        full_name: 'Phạm Mới',
        class_label: 'K21',
        dob: '2005-03-15',
        gender: 'male',
        must_change_password: true,
        created_by: admin.id,
        tags: ['candidate'],
      });
      expect(new Date(moi?.password_expires_at as string).getTime()).toBe(
        t.clock.now().getTime() + days(7),
      );
      const [hai] = await sql<Record<string, unknown>>(
        "SELECT username, email FROM users WHERE email = 'hai@example.edu.vn'",
      );
      expect(hai).toEqual({ username: 'hai@example.edu.vn', email: 'hai@example.edu.vn' });

      const tags = async (userId: string) =>
        (
          await sql<{ tag: string }>('SELECT tag::text FROM user_role_tags WHERE user_id = $1', [
            userId,
          ])
        ).map((r) => r.tag);
      expect(await tags(an.id)).toEqual(['candidate']);
      expect(await tags(binh.id)).toEqual([]);
    });

    it('chỉ dòng được chọn mới được duyệt; dòng khác họ tên duyệt riêng là "đúng người này"', async () => {
      const binh = await seedUser({ fullName: 'Trần Thị Bình', email: 'binh@example.edu.vn' });
      const id = await pending(
        csvFile('Một,B1,,,,', 'Hai,B2,,,,', 'Khác Tên,,binh@example.edu.vn,,,'),
      );
      const [one, , mismatch] = await itemsOf(admin.cookie, id);

      await approved(id, { approveItemIds: [one?.id] });
      expect(outcomes(await itemsOf(admin.cookie, id))).toEqual([
        [2, 'created', null],
        [3, 'pending', null],
        [4, 'pending', null],
      ]);
      expect(await statusOf(admin.cookie, id)).toBe('pending');

      await approved(id, { approveItemIds: [mismatch?.id] });
      expect((await itemsOf(admin.cookie, id))[2]).toMatchObject({ outcome: 'tag_added' });
      expect(await sql('SELECT 1 FROM user_role_tags WHERE user_id = $1', [binh.id])).toHaveLength(
        1,
      );
    });

    it('từ chối từng dòng; hết dòng chờ thì chốt trạng thái cả yêu cầu (Q91)', async () => {
      const allOk = await pending(csvFile('Một,B1,,,,', 'Hai,B2,,,,'));
      await approved(allOk, { allValid: true });
      expect(await statusOf(admin.cookie, allOk)).toBe('approved');

      const mixed = await pending(csvFile('Ba,B3,,,,', 'Bốn,B4,,,,'));
      const [three, four] = await itemsOf(admin.cookie, mixed);
      await approved(mixed, { approveItemIds: [three?.id], rejectItemIds: [four?.id] });
      expect(outcomes(await itemsOf(admin.cookie, mixed))).toEqual([
        [2, 'created', null],
        [3, 'rejected', 'rejected_by_admin'],
      ]);
      expect(await statusOf(admin.cookie, mixed)).toBe('partially_approved');

      const noneOk = await pending(csvFile('Năm,B5,,,,'));
      const [five] = await itemsOf(admin.cookie, noneOk);
      // Chỉ từ chối: xong ngay, không cần worker.
      const res = await approve(noneOk, { rejectItemIds: [five?.id] });
      expect(res.json().status).toBe('rejected');
      expect(t.queue.pending).toBe(0);
    });

    it('dòng thành "bỏ qua" khi tên đăng nhập, mã hoặc email đã bị người khác dùng trong lúc chờ', async () => {
      const id = await pending(
        csvFile('Một,B1,,,,', 'Hai,B2,,,,', 'Ba,,ba@example.edu.vn,,,', 'Bốn,B4,,,,'),
      );
      await seedUser({ username: 'b1' }); // trùng tên đăng nhập sẽ dùng
      await seedUser({ username: 'ai-do', code: 'B2' }); // trùng mã
      await seedUser({ username: 'khac', email: 'ba@example.edu.vn' }); // trùng email
      await approved(id, { allValid: true });
      expect(outcomes(await itemsOf(admin.cookie, id))).toEqual([
        [2, 'skipped', 'username_taken'],
        [3, 'skipped', 'code_taken'],
        [4, 'skipped', 'email_taken'],
        [5, 'created', null],
      ]);
      expect(t.slips.entries.map((e) => e.username)).toEqual(['b4']);
      expect(await statusOf(admin.cookie, id)).toBe('partially_approved');
    });

    it('người có sẵn đã bị Xóa hoặc thành Quản trị viên giữa chừng thì bỏ qua', async () => {
      const an = await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const id = await pending(csvFile('Nguyễn Văn An,B100,,,,'));
      await sql('UPDATE users SET removed_at = now() WHERE id = $1', [an.id]);
      await approved(id, { allValid: true });
      expect((await itemsOf(admin.cookie, id))[0]).toMatchObject({
        outcome: 'skipped',
        outcomeNote: 'user_unavailable',
      });
    });
  });

  describe('kiểm tra yêu cầu duyệt', () => {
    it('chỉ Quản trị viên duyệt', async () => {
      const id = await pending(csvFile('Một,B1,,,,'));
      expect((await approve(id, { allValid: true }, examiner.cookie)).statusCode).toBe(403);
    });

    it('từ chối chọn dòng không duyệt được, dòng không thuộc yêu cầu, chọn trùng, hoặc không chọn gì', async () => {
      const id = await pending(csvFile('Một,B1,,,,', ',B2,,,,'));
      const other = await pending(csvFile('Khác,B9,,,,'));
      const [one, blocked] = await itemsOf(admin.cookie, id);
      const [foreign] = await itemsOf(admin.cookie, other);
      const issue = async (body: unknown) => (await approve(id, body)).json().issues?.[0];

      expect(await issue({ approveItemIds: [blocked?.id] })).toEqual({
        path: 'approveItemIds',
        code: 'item_not_approvable',
      });
      expect(await issue({ approveItemIds: [foreign?.id] })).toEqual({
        path: 'approveItemIds',
        code: 'item_not_approvable',
      });
      expect(await issue({ rejectItemIds: [blocked?.id] })).toEqual({
        path: 'rejectItemIds',
        code: 'item_not_rejectable',
      });
      expect(await issue({ approveItemIds: [one?.id], rejectItemIds: [one?.id] })).toEqual({
        path: 'rejectItemIds',
        code: 'item_not_rejectable',
      });
      expect(await issue({})).toEqual({ path: 'approveItemIds', code: 'nothing_selected' });
      expect(await issue({ allValid: false })).toEqual({
        path: 'approveItemIds',
        code: 'nothing_selected',
      });
      expect(await statusOf(admin.cookie, id)).toBe('pending');
    });

    it('chỉ duyệt được yêu cầu đang "chờ duyệt"; bấm hai lần thì lần hai bị từ chối', async () => {
      const id = await pending(csvFile('Một,B1,,,,'));
      expect((await approve(id, { allValid: true })).statusCode).toBe(200);
      expect((await approve(id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });
      await t.queue.drain();
      expect(await statusOf(admin.cookie, id)).toBe('approved');
      expect((await approve(id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });

      const parsing = await upload(t.app, '/api/account-requests', csvFile('A,B7,,,,'), {
        cookie: examiner.cookie,
      });
      expect((await approve(parsing.json().id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('hai Quản trị viên duyệt cùng lúc: chỉ một lần thành công', async () => {
      const id = await pending(csvFile('Một,B1,,,,', 'Hai,B2,,,,'));
      const other = await signedIn({ isAdmin: true });
      const results = await Promise.all([
        approve(id, { allValid: true }),
        approve(id, { allValid: true }, other.cookie),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      await t.queue.drain();
      expect(await sql("SELECT 1 FROM users WHERE code IN ('B1', 'B2')")).toHaveLength(2);
      expect(t.slips.calls).toHaveLength(1);
    });

    it('xếp job lỗi thì yêu cầu trở lại "chờ duyệt", không kẹt', async () => {
      const id = await pending(csvFile('Một,B1,,,,'));
      t.queue.failNextEnqueue = true;
      expect((await approve(id, { allValid: true })).statusCode).toBe(500);
      expect(await statusOf(admin.cookie, id)).toBe('pending');
      expect((await approve(id, { allValid: true })).statusCode).toBe(200);
    });

    it('chạy lại job duyệt không tạo tài khoản lần hai', async () => {
      const id = await pending(csvFile('Một,B1,,,,'));
      const [one] = await itemsOf(admin.cookie, id);
      await approved(id, { allValid: true });
      await t.app.get(JobRegistry).run('account-request.approve', {
        requestId: id,
        itemIds: [one?.id as string],
        reviewerId: admin.id,
        reviewerIp: null,
        rejectedCount: 0,
      });
      expect(await sql("SELECT 1 FROM users WHERE code = 'B1'")).toHaveLength(1);
      expect(t.slips.calls).toHaveLength(1);
    });
  });

  describe('mật khẩu tạm và Phiếu tài khoản', () => {
    it('mật khẩu trên phiếu đăng nhập được và buộc đổi; không nằm ở bất kỳ đâu trong DB', async () => {
      const id = await pending(
        csvFile('Phạm Mới,B500,,K21,,', 'Lê Hai,B501,hai@example.edu.vn,K21,,'),
      );
      await approved(id, { allValid: true });
      const entries = t.slips.entries;
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        fullName: 'Phạm Mới',
        code: 'B500',
        classLabel: 'K21',
        username: 'b500',
      });

      for (const entry of entries) {
        expect(entry.temporaryPassword).toHaveLength(10);
        const session = await login(t.app, entry.username, entry.temporaryPassword);
        expect(session.res.statusCode).toBe(200);
        const me = await get(session.cookie as string, '/api/auth/me');
        expect(me.json()).toMatchObject({ mustChangePassword: true, roleTags: ['candidate'] });
      }

      // Mật khẩu dạng rõ không có trong bảng nào mà API ghi (Q93).
      for (const { temporaryPassword } of entries) {
        const like = `%${temporaryPassword}%`;
        for (const query of [
          'SELECT 1 FROM audit_logs WHERE before::text LIKE $1 OR after::text LIKE $1',
          'SELECT 1 FROM notifications WHERE data::text LIKE $1',
          'SELECT 1 FROM account_request_items WHERE outcome_note LIKE $1',
          'SELECT 1 FROM login_events WHERE identifier_tried LIKE $1 OR failure_reason LIKE $1',
        ]) {
          expect(await sql(query, [like])).toHaveLength(0);
        }
        // Chỉ băm Argon2 được lưu, không có chính mật khẩu.
        expect(
          await sql('SELECT 1 FROM users WHERE password_hash = $1', [temporaryPassword]),
        ).toHaveLength(0);
      }
    });

    it('phiếu lưu dạng mã hóa trên MediaStore; liệt kê phiếu của yêu cầu', async () => {
      await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const id = await pending(csvFile('Mới,B500,,,,', 'Nguyễn Văn An,B100,,,,'));
      await approved(id, { allValid: true });

      const slips = (await get(examiner.cookie, `/api/account-requests/${id}/slips`)).json();
      expect(slips).toEqual([
        {
          id: expect.any(String),
          status: 'ready',
          itemCount: 1,
          createdAt: t.clock.now().toISOString(),
          expiresAt: new Date(t.clock.now().getTime() + days(7)).toISOString(),
        },
      ]);
      // Dòng danh sách Excel có cả người được thêm vai trò; phiếu PDF chỉ có người mới.
      expect(t.slips.calls[0]?.listRows.map((r) => [r.fullName, r.outcome])).toEqual([
        ['Mới', 'created'],
        ['Nguyễn Văn An', 'tag_added'],
      ]);

      const dir = path.join(process.env.MEDIA_DIR as string, 'slips');
      const files = (await readdir(dir)).filter((f) => f.endsWith('.enc'));
      expect(files.sort()).toEqual([`${slips[0].id}.pdf.enc`, `${slips[0].id}.xlsx.enc`]);
      const onDisk = await readFile(path.join(dir, `${slips[0].id}.pdf.enc`));
      expect(onDisk.includes(FAKE_PDF)).toBe(false);
    });

    it('không có tài khoản mới thì không có phiếu', async () => {
      await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const id = await pending(csvFile('Nguyễn Văn An,B100,,,,'));
      await approved(id, { allValid: true });
      expect((await get(admin.cookie, `/api/account-requests/${id}/slips`)).json()).toEqual([]);
    });

    it('Quản trị viên và người gửi tải được PDF và Excel; mỗi lần tải ghi nhật ký', async () => {
      const id = await pending(csvFile('Mới,B500,,,,'));
      await approved(id, { allValid: true });
      const [slip] = (await get(admin.cookie, `/api/account-requests/${id}/slips`)).json();

      const pdf = await get(examiner.cookie, `/api/credential-slips/${slip.id}/pdf`);
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toMatch(
        /attachment; filename="phieu-tai-khoan-\d{8}\.pdf"/,
      );
      expect(pdf.rawPayload.equals(FAKE_PDF)).toBe(true);

      const xlsx = await get(admin.cookie, `/api/credential-slips/${slip.id}/xlsx`);
      expect(xlsx.statusCode).toBe(200);
      expect(xlsx.headers['content-type']).toContain('spreadsheetml');
      expect(xlsx.rawPayload.equals(FAKE_XLSX)).toBe(true);

      const logs = (await get(admin.cookie, `/api/admin/audit-logs?entityId=${slip.id}`)).json()
        .items;
      expect(logs).toMatchObject([
        { action: 'credential-slip.download', actorName: 'Quản Trị', after: { format: 'xlsx' } },
        {
          action: 'credential-slip.download',
          actorName: 'Lê Giảng Viên',
          after: { format: 'pdf' },
        },
      ]);
    });

    it('Người ra đề khác và Người dự thi không thấy phiếu', async () => {
      const id = await pending(csvFile('Mới,B500,,,,'));
      await approved(id, { allValid: true });
      const [slip] = (await get(admin.cookie, `/api/account-requests/${id}/slips`)).json();
      const other = await signedIn({ roleTags: ['examiner'] });
      const candidate = await signedIn({ roleTags: ['candidate'] });

      expect((await get(other.cookie, `/api/credential-slips/${slip.id}/pdf`)).statusCode).toBe(
        404,
      );
      expect((await get(other.cookie, `/api/account-requests/${id}/slips`)).statusCode).toBe(404);
      expect((await get(candidate.cookie, `/api/credential-slips/${slip.id}/pdf`)).statusCode).toBe(
        403,
      );
      expect((await call(t.app, 'GET', `/api/credential-slips/${slip.id}/pdf`)).statusCode).toBe(
        401,
      );
      expect(
        (await get(admin.cookie, '/api/credential-slips/0198f0f0-0000-7000-8000-000000000000/pdf'))
          .statusCode,
      ).toBe(404);
    });

    it('quá 7 ngày thì không tải được nữa (410)', async () => {
      const id = await pending(csvFile('Mới,B500,,,,'));
      await approved(id, { allValid: true });
      const [slip] = (await get(admin.cookie, `/api/account-requests/${id}/slips`)).json();

      await advance(days(7) - minutes(1));
      expect((await get(admin.cookie, `/api/credential-slips/${slip.id}/pdf`)).statusCode).toBe(
        200,
      );
      await advance(minutes(2));
      const late = await get(examiner.cookie, `/api/credential-slips/${slip.id}/pdf`);
      expect(late.statusCode).toBe(410);
      expect(late.json()).toMatchObject({ code: 'SLIP_EXPIRED' });
    });

    it('dựng PDF lỗi: tài khoản vẫn được tạo, phiếu ghi "lỗi", tải thì INVALID_STATE', async () => {
      const id = await pending(csvFile('Mới,B500,,,,'));
      t.slips.failNext = true;
      await approved(id, { allValid: true });
      expect(await sql("SELECT 1 FROM users WHERE code = 'B500'")).toHaveLength(1);
      const [slip] = (await get(admin.cookie, `/api/account-requests/${id}/slips`)).json();
      expect(slip).toMatchObject({ status: 'failed' });
      expect(
        (await get(admin.cookie, `/api/credential-slips/${slip.id}/pdf`)).json(),
      ).toMatchObject({
        code: 'INVALID_STATE',
      });
    });
  });

  describe('an toàn khi worker chết giữa chừng (Q93)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('chết sau khi tạo tài khoản mà chưa lưu phiếu: job chạy lại dựng đủ phiếu với đúng mật khẩu, không nhân đôi', async () => {
      const id = await pending(csvFile('Mới Một,B500,,,,', 'Mới Hai,B501,,,,'));
      await approve(id, { allValid: true });

      // Lần chạy đầu: lưu phiếu thất bại (như worker chết ngay lúc đó), job ném lỗi.
      const notifications = t.app.get(NotificationsService);
      const original = notifications.notify.bind(notifications);
      vi.spyOn(notifications, 'notify').mockImplementation(async (input, tx) => {
        if (input.type === 'credential_slip.ready') throw new Error('worker chết');
        return original(input, tx);
      });
      await expect(t.queue.drain()).rejects.toThrow('worker chết');
      expect(await sql('SELECT 1 FROM credential_slips')).toHaveLength(0);
      expect(await sql("SELECT 1 FROM users WHERE code IN ('B500', 'B501')")).toHaveLength(2);
      expect(await statusOf(admin.cookie, id)).toBe('approving');
      vi.restoreAllMocks();

      // BullMQ giao lại job: các dòng đã tạo, phiếu được dựng từ thông tin đã mã hóa lưu lúc tạo tài khoản.
      const job = t.queue.history.at(-1);
      await t.app.get(JobRegistry).run('account-request.approve', job?.payload as never);

      expect(await sql('SELECT 1 FROM credential_slips')).toHaveLength(1);
      expect(await statusOf(admin.cookie, id)).toBe('approved');
      const finalEntries = t.slips.calls.at(-1)?.entries ?? [];
      expect(finalEntries.map((e) => e.username)).toEqual(['b500', 'b501']);
      for (const entry of finalEntries) {
        expect((await login(t.app, entry.username, entry.temporaryPassword)).res.statusCode).toBe(
          200,
        );
      }
      const logs = (
        await get(
          admin.cookie,
          `/api/admin/audit-logs?entityId=${id}&action=account-request.approve`,
        )
      ).json();
      expect(logs.items).toHaveLength(1);
      expect(logs.items[0].after).toMatchObject({ approved: 2, created: 2 });
      // Không còn file thông tin tạm sau khi phiếu đã lưu.
      const leftovers = await readdir(
        path.join(process.env.MEDIA_DIR as string, 'slips', 'pending', id),
      ).catch(() => []);
      expect(leftovers).toEqual([]);
    });

    it('chết sau khi chốt phiếu mà chưa ghi trạng thái: chạy lại chỉ chốt nốt, không dựng phiếu thứ hai', async () => {
      const id = await pending(csvFile('Mới,B500,,,,'));
      await approve(id, { allValid: true });
      const audit = t.app.get(AuditService);
      const original = audit.record.bind(audit);
      vi.spyOn(audit, 'record').mockImplementation(async (entry, tx) => {
        if (entry.action === 'account-request.approve') throw new Error('worker chết');
        return original(entry, tx);
      });
      await expect(t.queue.drain()).rejects.toThrow('worker chết');
      vi.restoreAllMocks();

      await t.app
        .get(JobRegistry)
        .run('account-request.approve', t.queue.history.at(-1)?.payload as never);
      expect(await sql('SELECT 1 FROM credential_slips')).toHaveLength(1);
      expect(t.slips.calls).toHaveLength(1);
      expect(await statusOf(admin.cookie, id)).toBe('approved');
      const types = (await get(examiner.cookie, '/api/notifications'))
        .json()
        .items.map((n: { type: string }) => n.type);
      expect(types.filter((x: string) => x === 'credential_slip.ready')).toHaveLength(1);
    });

    it('hạn mật khẩu từng tài khoản trùng với hạn của phiếu (Q21)', async () => {
      const id = await pending(csvFile('Một,B1,,,,', 'Hai,B2,,,,'));
      await approved(id, { allValid: true });
      const [slip] = await sql<{ expires_at: Date }>('SELECT expires_at FROM credential_slips');
      const expiries = await sql<{ password_expires_at: Date }>(
        "SELECT password_expires_at FROM users WHERE code IN ('B1', 'B2')",
      );
      for (const row of expiries) {
        expect(row.password_expires_at.getTime()).toBe(slip?.expires_at.getTime());
      }
    });
  });

  describe('thông báo và nhật ký', () => {
    it('báo phiếu sẵn sàng cho người duyệt và người gửi, báo kết quả cho người gửi', async () => {
      const id = await pending(csvFile('Một,B1,,,,'));
      await approved(id, { allValid: true });

      const types = async (cookie: string) =>
        (await get(cookie, '/api/notifications')).json().items.map((n: { type: string }) => n.type);
      expect(await types(examiner.cookie)).toEqual([
        'account_request.reviewed',
        'credential_slip.ready',
      ]);
      expect((await get(examiner.cookie, '/api/notifications')).json().items[0]).toMatchObject({
        data: { requestId: id, status: 'approved' },
      });
      expect(await types(admin.cookie)).toContain('credential_slip.ready');
    });

    it('ghi một dòng nhật ký account-request.approve cho mỗi đợt duyệt, kèm số lượng', async () => {
      const id = await pending(csvFile('Một,B1,,,,', 'Hai,B2,,,,', 'Ba,B3,,,,'));
      const [, two] = await itemsOf(admin.cookie, id);
      await approved(id, {
        approveItemIds: [(await itemsOf(admin.cookie, id))[0]?.id],
        rejectItemIds: [two?.id],
      });

      const logs = (
        await get(
          admin.cookie,
          `/api/admin/audit-logs?entityId=${id}&action=account-request.approve`,
        )
      ).json().items;
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        actorName: 'Quản Trị',
        after: { approved: 1, created: 1, tagAdded: 0, skipped: 0, rejected: 1 },
      });
      expect(logs[0].after.slipId).toEqual(expect.any(String));
    });
  });
});

describe('tải phiếu với bộ dựng PDF thật', () => {
  let real: TestApp;
  beforeAll(async () => {
    real = await createTestApp({ realSlips: true });
  });
  afterAll(async () => {
    await real.app.close();
  });

  it('PDF hợp lệ, đủ số trang (8 phiếu/trang); Excel không chứa mật khẩu', async () => {
    await resetState();
    const examiner = await seedUser({ roleTags: ['examiner'] });
    await seedUser({ username: 'qt-that', isAdmin: true });
    const examinerCookie = (await login(real.app, examiner.username as string, DEFAULT_PASSWORD))
      .cookie as string;
    const adminCookie = (await login(real.app, 'qt-that', DEFAULT_PASSWORD)).cookie as string;
    const rows = Array.from({ length: 9 }, (_, i) => `Người Số ${i},B9${i},,CNTT,,`);
    const sent = await upload(real.app, '/api/account-requests', csvFile(...rows), {
      cookie: examinerCookie,
    });
    await real.queue.drain();
    await call(real.app, 'POST', `/api/account-requests/${sent.json().id}/approve`, {
      cookie: adminCookie,
      body: { allValid: true },
    });
    await real.queue.drain();

    const [slip] = (
      await call(real.app, 'GET', `/api/account-requests/${sent.json().id}/slips`, {
        cookie: adminCookie,
      })
    ).json();
    const pdf = await call(real.app, 'GET', `/api/credential-slips/${slip.id}/pdf`, {
      cookie: examinerCookie,
    });
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.rawPayload.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length).toBe(2);

    const xlsx = await call(real.app, 'GET', `/api/credential-slips/${slip.id}/xlsx`, {
      cookie: adminCookie,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]?.rowCount).toBe(10); // tiêu đề + 9 người
  });
});

describe('dọn dẹp hằng ngày (Q96)', () => {
  const cleanup = () => t.app.get(JobRegistry).run('maintenance.cleanup', {});

  it('xóa lịch sử đăng nhập quá 12 tháng, giữ lịch sử mới hơn', async () => {
    const user = await seedUser({});
    const insert = (at: Date) =>
      sql(
        "INSERT INTO login_events (id, user_id, identifier_tried, success, at) VALUES (gen_random_uuid(), $1, 'x', true, $2)",
        [user.id, at],
      );
    const now = t.clock.now();
    await insert(new Date(now.getTime() - days(367)));
    await insert(new Date(now.getTime() - days(300)));
    await cleanup();
    expect(await sql('SELECT 1 FROM login_events')).toHaveLength(1);
  });

  it('một bước dọn dẹp lỗi không làm dừng các bước còn lại', async () => {
    const user = await seedUser({});
    await sql(
      "INSERT INTO login_events (id, user_id, identifier_tried, success, at) VALUES (gen_random_uuid(), $1, 'x', true, $2)",
      [user.id, new Date(t.clock.now().getTime() - days(400))],
    );
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const admin = await signedIn({ isAdmin: true });
    const res = await upload(t.app, '/api/account-requests', csvFile('Một,B1,,,,'), {
      cookie: examiner.cookie,
    });
    await t.queue.drain();
    await post(admin.cookie, `/api/account-requests/${res.json().id}/approve`, { allValid: true });
    await t.queue.drain();
    t.clock.advance(days(8));

    const media = t.app.get<MediaStore>(MEDIA_STORE);
    vi.spyOn(media, 'delete').mockRejectedValue(new Error('ổ đĩa lỗi'));
    await cleanup(); // bước xóa file phiếu lỗi nhưng không ném ra ngoài
    vi.restoreAllMocks();
    expect(await sql('SELECT 1 FROM login_events WHERE identifier_tried = $1', ['x'])).toHaveLength(
      0,
    );
  });

  it('phiếu hết hạn bị xóa file và đặt "hết hạn"', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const admin = await signedIn({ isAdmin: true });
    const res = await upload(t.app, '/api/account-requests', csvFile('Một,B1,,,,'), {
      cookie: examiner.cookie,
    });
    await t.queue.drain();
    await post(admin.cookie, `/api/account-requests/${res.json().id}/approve`, { allValid: true });
    await t.queue.drain();

    const dir = path.join(process.env.MEDIA_DIR as string, 'slips');
    const slipFiles = async () => (await readdir(dir)).filter((f) => f.endsWith('.enc'));
    expect(await slipFiles()).toHaveLength(2);
    await cleanup();
    expect(await slipFiles()).toHaveLength(2); // chưa hết hạn

    t.clock.advance(days(8));
    await cleanup();
    expect(await slipFiles()).toEqual([]);
    expect(await sql<{ status: string }>('SELECT status::text FROM credential_slips')).toEqual([
      { status: 'expired' },
    ]);
  });

  it('yêu cầu kẹt ở "đang đọc file" quá 15 phút (worker chết) chuyển sang parse_failed và báo người gửi', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const res = await upload(t.app, '/api/account-requests', csvFile('Một,B1,,,,'), {
      cookie: examiner.cookie,
    });
    const id = res.json().id;
    t.queue.discard(); // giả lập job không bao giờ được xử lý

    t.clock.advance(minutes(14));
    await cleanup();
    expect(
      (await sql<{ status: string }>('SELECT status::text FROM account_requests'))[0]?.status,
    ).toBe('parsing');

    t.clock.advance(minutes(2));
    await cleanup();
    const [row] = await sql<{ status: string; parse_error: string }>(
      'SELECT status::text, parse_error FROM account_requests',
    );
    expect(row).toEqual({ status: 'parse_failed', parse_error: 'internal_error' });
    const cookie = (await login(t.app, examiner.username as string, DEFAULT_PASSWORD))
      .cookie as string;
    expect((await get(cookie, '/api/notifications')).json().items[0]).toMatchObject({
      type: 'account_request.parse_failed',
      data: { requestId: id },
    });
    const uploads = await readdir(path.join(process.env.MEDIA_DIR as string, 'uploads')).catch(
      () => [],
    );
    expect(uploads).toEqual([]);
  });
});
