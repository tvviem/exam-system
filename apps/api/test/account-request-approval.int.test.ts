import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_STORE, type MediaStore } from '../src/media/media-store';
import { AuditService } from '../src/modules/audit/audit.service';
import {
  SLIP_RENDERER,
  type SlipRenderer,
} from '../src/modules/identity/credential-slips/slip-renderer';
import { SlipVault } from '../src/modules/identity/credential-slips/slip-vault';
import { MailService } from '../src/modules/mail/mail.service';
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

/**
 * Dựng sẵn một Phiếu tài khoản (từ PR 7c-2a, duyệt Yêu cầu không còn sinh Phiếu nhưng Phiếu cũ vẫn tải được tới hết hạn,
 * cho tới khi 7d bỏ hẳn): ghi hai tệp mã hóa lên MediaStore và một dòng `credential_slips`.
 */
async function seedSlip(
  requestId: string,
  createdBy: string,
  options: {
    status?: 'ready' | 'failed';
    app?: TestApp;
    files?: { pdf: Buffer; xlsx: Buffer };
  } = {},
) {
  const app = options.app ?? t;
  const id = uuidv7();
  const status = options.status ?? 'ready';
  const now = app.clock.now();
  let pdfKey: string | null = null;
  let xlsxKey: string | null = null;
  if (status === 'ready') {
    const vault = app.app.get(SlipVault);
    const media = app.app.get<MediaStore>(MEDIA_STORE);
    const files = options.files ?? { pdf: FAKE_PDF, xlsx: FAKE_XLSX };
    pdfKey = `slips/${id}.pdf.enc`;
    xlsxKey = `slips/${id}.xlsx.enc`;
    await media.put(pdfKey, vault.encrypt(files.pdf));
    await media.put(xlsxKey, vault.encrypt(files.xlsx));
  }
  await sql(
    `INSERT INTO credential_slips (id, request_id, created_by, item_count, status, pdf_key, xlsx_key, expires_at, created_at)
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8)`,
    [id, requestId, createdBy, status, pdfKey, xlsxKey, new Date(now.getTime() + days(7)), now],
  );
  return { id };
}

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.slips.calls.length = 0;
  t.mail.reset();
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
          'Nguyễn Văn An,B100,b100@example.edu.vn,,,', // exact
          'Phạm Mới,B500,moi@example.edu.vn,K21,15/03/2005,Nam', // new, có mã
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
                u.password_hash, u.password_expires_at, u.created_by,
                (SELECT array_agg(tag::text) FROM user_role_tags WHERE user_id = u.id) AS tags
           FROM users u WHERE u.code = 'B500'`,
      );
      expect(moi).toMatchObject({
        username: 'b500',
        email: 'moi@example.edu.vn',
        full_name: 'Phạm Mới',
        class_label: 'K21',
        dob: '2005-03-15',
        gender: 'male',
        password_hash: null, // Chờ kích hoạt: người dùng tự đặt mật khẩu bằng liên kết trong thư
        password_expires_at: null,
        created_by: admin.id,
        tags: ['candidate'],
      });
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
        csvFile(
          'Một,B1,b1@example.edu.vn,,,',
          'Hai,B2,b2@example.edu.vn,,,',
          'Khác Tên,,binh@example.edu.vn,,,',
        ),
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
      const allOk = await pending(
        csvFile('Một,B1,b1@example.edu.vn,,,', 'Hai,B2,b2@example.edu.vn,,,'),
      );
      await approved(allOk, { allValid: true });
      expect(await statusOf(admin.cookie, allOk)).toBe('approved');

      const mixed = await pending(
        csvFile('Ba,B3,b3@example.edu.vn,,,', 'Bốn,B4,b4@example.edu.vn,,,'),
      );
      const [three, four] = await itemsOf(admin.cookie, mixed);
      await approved(mixed, { approveItemIds: [three?.id], rejectItemIds: [four?.id] });
      expect(outcomes(await itemsOf(admin.cookie, mixed))).toEqual([
        [2, 'created', null],
        [3, 'rejected', 'rejected_by_admin'],
      ]);
      expect(await statusOf(admin.cookie, mixed)).toBe('partially_approved');

      const noneOk = await pending(csvFile('Năm,B5,b5@example.edu.vn,,,'));
      const [five] = await itemsOf(admin.cookie, noneOk);
      // Chỉ từ chối: xong ngay, không cần worker.
      const res = await approve(noneOk, { rejectItemIds: [five?.id] });
      expect(res.json().status).toBe('rejected');
      expect(t.queue.pending).toBe(0);
    });

    it('dòng thành "bỏ qua" khi tên đăng nhập, mã hoặc email đã bị người khác dùng trong lúc chờ', async () => {
      const id = await pending(
        csvFile(
          'Một,B1,b1@example.edu.vn,,,',
          'Hai,B2,b2@example.edu.vn,,,',
          'Ba,,ba@example.edu.vn,,,',
          'Bốn,B4,b4@example.edu.vn,,,',
        ),
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
      expect(t.mail.sent.map((m) => m.to)).toEqual(['b4@example.edu.vn']);
      expect(await statusOf(admin.cookie, id)).toBe('partially_approved');
    });

    it('người có sẵn đã bị Xóa hoặc thành Quản trị viên giữa chừng thì bỏ qua', async () => {
      const an = await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const id = await pending(csvFile('Nguyễn Văn An,B100,b100@example.edu.vn,,,'));
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
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,'));
      expect((await approve(id, { allValid: true }, examiner.cookie)).statusCode).toBe(403);
    });

    it('từ chối chọn dòng không duyệt được, dòng không thuộc yêu cầu, chọn trùng, hoặc không chọn gì', async () => {
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,', ',B2,b2@example.edu.vn,,,'));
      const other = await pending(csvFile('Khác,B9,b9@example.edu.vn,,,'));
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
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,'));
      expect((await approve(id, { allValid: true })).statusCode).toBe(200);
      expect((await approve(id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });
      await t.queue.drain();
      expect(await statusOf(admin.cookie, id)).toBe('approved');
      expect((await approve(id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });

      const parsing = await upload(
        t.app,
        '/api/account-requests',
        csvFile('A,B7,b7@example.edu.vn,,,'),
        {
          cookie: examiner.cookie,
        },
      );
      expect((await approve(parsing.json().id, { allValid: true })).json()).toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('hai Quản trị viên duyệt cùng lúc: chỉ một lần thành công', async () => {
      const id = await pending(
        csvFile('Một,B1,b1@example.edu.vn,,,', 'Hai,B2,b2@example.edu.vn,,,'),
      );
      const other = await signedIn({ isAdmin: true });
      const results = await Promise.all([
        approve(id, { allValid: true }),
        approve(id, { allValid: true }, other.cookie),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      await t.queue.drain();
      expect(await sql("SELECT 1 FROM users WHERE code IN ('B1', 'B2')")).toHaveLength(2);
      expect(await sql("SELECT 1 FROM email_outbox WHERE kind = 'activation'")).toHaveLength(2);
    });

    it('xếp job lỗi thì yêu cầu trở lại "chờ duyệt", không kẹt', async () => {
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,'));
      t.queue.failNextEnqueue = true;
      expect((await approve(id, { allValid: true })).statusCode).toBe(500);
      expect(await statusOf(admin.cookie, id)).toBe('pending');
      expect((await approve(id, { allValid: true })).statusCode).toBe(200);
    });

    it('chạy lại job duyệt không tạo tài khoản lần hai', async () => {
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,'));
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
      expect(await sql("SELECT 1 FROM email_outbox WHERE kind = 'activation'")).toHaveLength(1);
    });
  });

  describe('Phiếu tài khoản còn lại (cho tới 7d xóa hẳn)', () => {
    // Duyệt Yêu cầu KHÔNG còn sinh Phiếu (7c-2a); Phiếu cũ vẫn tải được tới hết hạn, nên dựng sẵn để kiểm.
    it('duyệt Yêu cầu không sinh Phiếu, không có mật khẩu tạm ở bất kỳ đâu', async () => {
      await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
      const id = await pending(
        csvFile('Mới,B500,b500@example.edu.vn,,,', 'Nguyễn Văn An,B100,b100@example.edu.vn,,,'),
      );
      await approved(id, { allValid: true });
      expect((await get(examiner.cookie, `/api/account-requests/${id}/slips`)).json()).toEqual([]);
      expect(await sql('SELECT 1 FROM credential_slips')).toHaveLength(0);
      expect(t.slips.calls).toHaveLength(0);
      const dir = path.join(process.env.MEDIA_DIR as string, 'slips');
      expect((await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.enc'))).toEqual([]);
      expect(
        await sql('SELECT 1 FROM users WHERE password_hash IS NOT NULL AND code = $1', ['B500']),
      ).toHaveLength(0);
    });

    it('liệt kê Phiếu của yêu cầu; lưu dạng mã hóa trên MediaStore', async () => {
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      const slip = await seedSlip(id, admin.id);
      const slips = (await get(examiner.cookie, `/api/account-requests/${id}/slips`)).json();
      expect(slips).toEqual([
        {
          id: slip.id,
          status: 'ready',
          itemCount: 1,
          createdAt: t.clock.now().toISOString(),
          expiresAt: new Date(t.clock.now().getTime() + days(7)).toISOString(),
        },
      ]);
      const dir = path.join(process.env.MEDIA_DIR as string, 'slips');
      const files = (await readdir(dir)).filter((f) => f.endsWith('.enc'));
      expect(files.sort()).toEqual([`${slip.id}.pdf.enc`, `${slip.id}.xlsx.enc`]);
      const onDisk = await readFile(path.join(dir, `${slip.id}.pdf.enc`));
      expect(onDisk.includes(FAKE_PDF)).toBe(false);
    });

    it('Quản trị viên và người gửi tải được PDF và Excel; mỗi lần tải ghi nhật ký', async () => {
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      const slip = await seedSlip(id, admin.id);

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
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      const slip = await seedSlip(id, admin.id);
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
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      const slip = await seedSlip(id, admin.id);

      await advance(days(7) - minutes(1));
      expect((await get(admin.cookie, `/api/credential-slips/${slip.id}/pdf`)).statusCode).toBe(
        200,
      );
      await advance(minutes(2));
      const late = await get(examiner.cookie, `/api/credential-slips/${slip.id}/pdf`);
      expect(late.statusCode).toBe(410);
      expect(late.json()).toMatchObject({ code: 'SLIP_EXPIRED' });
    });

    it('Phiếu ghi "lỗi" thì tải báo INVALID_STATE', async () => {
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      const slip = await seedSlip(id, admin.id, { status: 'failed' });
      expect(
        (await get(admin.cookie, `/api/credential-slips/${slip.id}/pdf`)).json(),
      ).toMatchObject({ code: 'INVALID_STATE' });
    });
  });

  describe('an toàn khi worker chết giữa chừng (Q93)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('chết sau khi tạo tài khoản và xếp thư mà chưa chốt trạng thái: chạy lại không tạo tài khoản hay thư lần hai', async () => {
      const id = await pending(
        csvFile('Mới Một,B500,b500@example.edu.vn,,,', 'Mới Hai,B501,b501@example.edu.vn,,,'),
      );
      await approve(id, { allValid: true });

      const audit = t.app.get(AuditService);
      const original = audit.record.bind(audit);
      vi.spyOn(audit, 'record').mockImplementation(async (entry, tx) => {
        if (entry.action === 'account-request.approve') throw new Error('worker chết');
        return original(entry, tx);
      });
      await expect(t.queue.drain()).rejects.toThrow('worker chết');
      expect(await sql("SELECT 1 FROM users WHERE code IN ('B500', 'B501')")).toHaveLength(2);
      expect(await sql("SELECT 1 FROM email_outbox WHERE kind = 'activation'")).toHaveLength(2);
      expect(await statusOf(admin.cookie, id)).toBe('approving');
      vi.restoreAllMocks();

      // BullMQ giao lại job: các dòng đã tạo, chỉ chốt nốt trạng thái và nhật ký.
      await t.app
        .get(JobRegistry)
        .run(
          'account-request.approve',
          t.queue.history.findLast((job) => job.name === 'account-request.approve')
            ?.payload as never,
        );
      expect(await sql("SELECT 1 FROM users WHERE code IN ('B500', 'B501')")).toHaveLength(2);
      expect(await sql("SELECT 1 FROM email_outbox WHERE kind = 'activation'")).toHaveLength(2);
      expect(await statusOf(admin.cookie, id)).toBe('approved');
      const logs = (
        await get(
          admin.cookie,
          `/api/admin/audit-logs?entityId=${id}&action=account-request.approve`,
        )
      ).json();
      expect(logs.items).toHaveLength(1);
      expect(logs.items[0].after).toMatchObject({ approved: 2, created: 2 });
    });

    it('thư kích hoạt và tài khoản cùng lưu hoặc cùng hủy: xếp thư lỗi thì không có tài khoản, dòng còn chờ duyệt lại', async () => {
      const id = await pending(csvFile('Mới,B500,b500@example.edu.vn,,,'));
      await approve(id, { allValid: true });
      vi.spyOn(t.app.get(MailService), 'enqueueIn').mockRejectedValue(
        new Error('hàng đợi thư lỗi'),
      );
      await t.queue.drain();
      vi.restoreAllMocks();

      expect(await sql("SELECT 1 FROM users WHERE code = 'B500'")).toHaveLength(0);
      expect(await sql('SELECT 1 FROM email_outbox')).toHaveLength(0);
      expect((await itemsOf(admin.cookie, id))[0]).toMatchObject({ outcome: 'pending' });
      const types = (await get(admin.cookie, '/api/notifications'))
        .json()
        .items.map((n: { type: string }) => n.type);
      expect(types).toContain('account_request.approve_interrupted');
    });
  });

  describe('thông báo và nhật ký', () => {
    it('báo kết quả cho người gửi; không còn thông báo "phiếu sẵn sàng"', async () => {
      const id = await pending(csvFile('Một,B1,b1@example.edu.vn,,,'));
      await approved(id, { allValid: true });

      const types = async (cookie: string) =>
        (await get(cookie, '/api/notifications')).json().items.map((n: { type: string }) => n.type);
      expect(await types(examiner.cookie)).toEqual(['account_request.reviewed']);
      expect((await get(examiner.cookie, '/api/notifications')).json().items[0]).toMatchObject({
        data: { requestId: id, status: 'approved' },
      });
      expect(await types(admin.cookie)).not.toContain('credential_slip.ready');
    });

    it('ghi một dòng nhật ký account-request.approve cho mỗi đợt duyệt, kèm số lượng', async () => {
      const id = await pending(
        csvFile(
          'Một,B1,b1@example.edu.vn,,,',
          'Hai,B2,b2@example.edu.vn,,,',
          'Ba,B3,b3@example.edu.vn,,,',
        ),
      );
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
      expect(logs[0].after).not.toHaveProperty('slipId');
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
    const admin = await seedUser({ username: 'qt-that2', isAdmin: true });
    const adminCookie = (await login(real.app, admin.username as string, DEFAULT_PASSWORD))
      .cookie as string;
    const sent = await upload(
      real.app,
      '/api/account-requests',
      csvFile('Một,B1,b1@example.edu.vn,,,'),
      {
        cookie: examinerCookie,
      },
    );
    await real.queue.drain();

    // Phiếu dựng bằng bộ dựng thật cho 9 người (Phiếu cũ còn tải được tới 7d).
    const renderer = real.app.get<SlipRenderer>(SLIP_RENDERER);
    const entries = Array.from({ length: 9 }, (_, i) => ({
      fullName: `Người Số ${i}`,
      code: `B9${i}`,
      classLabel: 'CNTT',
      username: `b9${i}`,
      temporaryPassword: 'MatKhauTam1',
    }));
    const files = await renderer.render({
      entries,
      listRows: entries.map((e) => ({ ...e, outcome: 'created' as const })),
      loginUrl: 'http://localhost:5173/login',
      expiresAt: new Date(real.clock.now().getTime() + days(7)),
    });
    const slip = await seedSlip(sent.json().id, admin.id, { app: real, files });

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
    const res = await upload(
      t.app,
      '/api/account-requests',
      csvFile('Một,B1,b1@example.edu.vn,,,'),
      {
        cookie: examiner.cookie,
      },
    );
    await t.queue.drain();
    await seedSlip(res.json().id, admin.id);
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
    const res = await upload(
      t.app,
      '/api/account-requests',
      csvFile('Một,B1,b1@example.edu.vn,,,'),
      {
        cookie: examiner.cookie,
      },
    );
    await t.queue.drain();
    await seedSlip(res.json().id, admin.id);

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
    const res = await upload(
      t.app,
      '/api/account-requests',
      csvFile('Một,B1,b1@example.edu.vn,,,'),
      {
        cookie: examiner.cookie,
      },
    );
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
