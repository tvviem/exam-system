import { readdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { csvFile, xlsxFile } from './support/files';
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
beforeEach(resetState);

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const send = (cookie: string, file: UploadFile, note?: string) =>
  upload(t.app, '/api/account-requests', file, { cookie, fields: note ? { note } : {} });
const get = (cookie: string, url: string) => call(t.app, 'GET', url, { cookie });

/** Người ra đề gửi file, worker xử lý xong; trả id yêu cầu. */
async function submitted(cookie: string, file: UploadFile): Promise<string> {
  const res = await send(cookie, file);
  expect(res.statusCode).toBe(201);
  await t.queue.drain();
  return res.json().id;
}
const itemsOf = async (cookie: string, id: string, query = '') =>
  (await get(cookie, `/api/account-requests/${id}/items?pageSize=100${query}`)).json().items;

describe('quyền và file mẫu', () => {
  it('chưa đăng nhập 401; người không phải Người ra đề hay Quản trị viên 403', async () => {
    expect((await call(t.app, 'GET', '/api/account-requests')).statusCode).toBe(401);
    const candidate = await signedIn({ roleTags: ['candidate'] });
    expect((await get(candidate.cookie, '/api/account-requests')).statusCode).toBe(403);
    const res = await send(candidate.cookie, csvFile('A,B1,,,,'));
    expect(res.statusCode).toBe(403);
  });

  it('Quản trị viên không gửi yêu cầu (chỉ Người ra đề gửi)', async () => {
    const admin = await signedIn({ isAdmin: true });
    expect((await send(admin.cookie, csvFile('A,B1,,,,'))).statusCode).toBe(403);
  });

  it('tải được file mẫu xlsx đúng sáu cột', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const res = await get(examiner.cookie, '/api/account-requests/template');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const header = ((workbook.worksheets[0]?.getRow(1).values ?? []) as string[]).slice(1);
    expect(header.map((h) => String(h).replace('*', '').trim())).toEqual([
      'Họ tên',
      'Mã định danh',
      'Email',
      'Lớp',
      'Ngày sinh',
      'Giới tính',
    ]);
  });
});

describe('tải lên và phân tích', () => {
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  beforeEach(async () => {
    examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
  });

  it('tải lên trả "đang xử lý" ngay, worker xử lý xong thì thành "chờ duyệt"', async () => {
    const res = await send(examiner.cookie, csvFile('Phạm Mới,B500,,K21,,Nam'), 'Lớp K21');
    expect(res.statusCode).toBe(201);
    const { id } = res.json();
    expect(res.json().status).toBe('parsing');
    expect((await get(examiner.cookie, `/api/account-requests/${id}`)).json().status).toBe(
      'parsing',
    );

    await t.queue.drain();
    const detail = (await get(examiner.cookie, `/api/account-requests/${id}`)).json();
    expect(detail).toMatchObject({
      id,
      status: 'pending',
      note: 'Lớp K21',
      originalFilename: 'danh-sach.csv',
      rowCount: 1,
      requesterName: 'Lê Giảng Viên',
      counts: { new: 1, exact: 0, name_mismatch: 0, blocked: 0 },
    });
  });

  it('khớp tài khoản có sẵn: đủ bốn giá trị match_status và lý do chặn (Q90)', async () => {
    const an = await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
    const binh = await seedUser({ fullName: 'Trần Thị Bình', email: 'binh@example.edu.vn' });
    await seedUser({ isAdmin: true, email: 'qt@example.edu.vn' });
    await seedUser({ removed: true, code: 'B300', fullName: 'Đã Xóa' });
    await seedUser({ code: 'B400', fullName: 'Người Mã' });
    await seedUser({ email: 'b400@example.edu.vn', fullName: 'Người Email' });
    const khoa = await seedUser({ status: 'locked', code: 'B600', fullName: 'Bị Khóa' });

    const id = await submitted(
      examiner.cookie,
      csvFile(
        'nguyen van an,b100,,,,', // exact (mã, khác hoa thường và dấu)
        'Lê Văn Khác,,BINH@example.edu.vn,,,', // name_mismatch (email)
        'Quản Trị,,qt@example.edu.vn,,,', // blocked: Quản trị viên
        'Đã Xóa,B300,,,,', // blocked: đã bị Xóa
        'Ai Đó,B400,b400@example.edu.vn,,,', // blocked: mã và email là hai người khác nhau
        'Bị Khóa,B600,,,,', // exact dù đang bị Khóa
        'Phạm Mới,B500,,,,', // new
        ',B700,,,,', // blocked: thiếu họ tên
        'Trùng,B500,,,,', // blocked: trùng trong file
      ),
    );

    const admin = await signedIn({ isAdmin: true });
    const items = await itemsOf(admin.cookie, id);
    const summary = items.map((i: Record<string, unknown>) => [
      i.rowNumber,
      i.matchStatus,
      i.outcome,
      i.outcomeNote,
      (i.matchedUser as { id: string } | null)?.id ?? null,
    ]);
    expect(summary).toEqual([
      [2, 'exact', 'pending', null, an.id],
      [3, 'name_mismatch', 'pending', null, binh.id],
      [4, 'blocked', 'rejected', 'matches_admin', null],
      [5, 'blocked', 'rejected', 'matches_removed_user', null],
      [6, 'blocked', 'rejected', 'code_email_conflict', null],
      [7, 'exact', 'pending', null, khoa.id],
      [8, 'new', 'pending', null, null],
      [9, 'blocked', 'rejected', 'missing_full_name', null],
      [10, 'blocked', 'rejected', 'duplicate_in_file', null],
    ]);
    const detail = (await get(examiner.cookie, `/api/account-requests/${id}`)).json();
    expect(detail.counts).toEqual({ new: 1, exact: 2, name_mismatch: 1, blocked: 5 });
  });

  it('mã thuộc người đã bị Xóa mà email thuộc người đang dùng thì chặn, không khớp nhầm người đang dùng', async () => {
    await seedUser({ removed: true, code: 'B800', fullName: 'Người Cũ' });
    await seedUser({ email: 'dang.dung@example.edu.vn', fullName: 'Người Mới' });
    const admin = await signedIn({ isAdmin: true });
    const id = await submitted(
      examiner.cookie,
      csvFile('Người Mới,B800,dang.dung@example.edu.vn,,,'),
    );
    const [item] = await itemsOf(admin.cookie, id);
    expect(item).toMatchObject({ matchStatus: 'blocked', outcomeNote: 'code_email_conflict' });
  });

  it('Người ra đề không thấy tên tài khoản bị khớp hay lý do chặn cụ thể (tránh dò danh bạ)', async () => {
    await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
    await seedUser({ isAdmin: true, email: 'qt@example.edu.vn' });
    const id = await submitted(
      examiner.cookie,
      csvFile('Nguyễn Văn An,B100,,,,', 'Quản Trị,,qt@example.edu.vn,,,'),
    );
    const [exact, blocked] = await itemsOf(examiner.cookie, id);
    expect(exact).toMatchObject({ matchStatus: 'exact', matchedUser: null });
    expect(blocked).toMatchObject({
      matchStatus: 'blocked',
      outcomeNote: 'account_conflict',
      matchedUser: null,
    });
  });

  it('job phân tích chạy lại không chèn dòng lần hai', async () => {
    const id = await submitted(examiner.cookie, csvFile('A,B1,,,,', 'B,B2,,,,'));
    await t.app.get(JobRegistry).run('account-request.parse', { requestId: id });
    expect(await itemsOf(examiner.cookie, id)).toHaveLength(2);
    expect((await get(examiner.cookie, `/api/account-requests/${id}`)).json().rowCount).toBe(2);
  });

  it('lọc dòng theo match_status và phân trang', async () => {
    await seedUser({ fullName: 'Nguyễn Văn An', code: 'B100' });
    const id = await submitted(
      examiner.cookie,
      csvFile('Nguyễn Văn An,B100,,,,', 'Một,B1,,,,', 'Hai,B2,,,,', 'Ba,B3,,,,'),
    );
    expect(await itemsOf(examiner.cookie, id, '&matchStatus=new')).toHaveLength(3);
    expect(await itemsOf(examiner.cookie, id, '&matchStatus=exact')).toHaveLength(1);
    const page = (
      await get(examiner.cookie, `/api/account-requests/${id}/items?pageSize=2&page=2`)
    ).json();
    expect(page).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page.items.map((i: { rowNumber: number }) => i.rowNumber)).toEqual([4, 5]);
  });

  it('đọc được file xlsx', async () => {
    const id = await submitted(
      examiner.cookie,
      await xlsxFile([
        ['Phạm Mới', 2103456, 'moi@example.edu.vn', 'K21', new Date(Date.UTC(2005, 2, 15)), 'Nữ'],
      ]),
    );
    const [item] = await itemsOf(examiner.cookie, id);
    expect(item).toMatchObject({
      fullName: 'Phạm Mới',
      code: '2103456',
      email: 'moi@example.edu.vn',
      classLabel: 'K21',
      dateOfBirth: '2005-03-15',
      gender: 'female',
      matchStatus: 'new',
    });
  });

  it('xóa file tải lên tạm sau khi phân tích', async () => {
    await submitted(examiner.cookie, csvFile('A,B1,,,,'));
    const uploads = await readdir(path.join(process.env.MEDIA_DIR as string, 'uploads')).catch(
      () => [],
    );
    expect(uploads).toEqual([]);
  });

  it('ghi nhật ký account-request.create', async () => {
    const admin = await signedIn({ isAdmin: true });
    const id = await submitted(examiner.cookie, csvFile('A,B1,,,,'));
    const logs = (await get(admin.cookie, `/api/admin/audit-logs?entityId=${id}`)).json().items;
    expect(logs).toMatchObject([
      {
        action: 'account-request.create',
        actorId: examiner.id,
        after: { originalFilename: 'danh-sach.csv' },
      },
    ]);
  });
});

describe('file không dùng được', () => {
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  beforeEach(async () => {
    examiner = await signedIn({ roleTags: ['examiner'] });
  });

  it('nội dung không phải xlsx hay csv bị từ chối ngay, không tạo yêu cầu', async () => {
    const pdf = { filename: 'danh-sach.xlsx', content: Buffer.from('%PDF-1.7\0binary') };
    const res = await send(examiner.cookie, pdf);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'file', code: 'unsupported_file' }],
    });
    expect((await get(examiner.cookie, '/api/account-requests')).json().total).toBe(0);
  });

  it('file zip không phải xlsx (ví dụ .docx) bị từ chối ngay khi tải lên', async () => {
    const real = await xlsxFile([['A', 'B1']]);
    const docx = {
      ...real,
      filename: 'khong-phai-excel.xlsx',
      content: Buffer.from(
        real.content.toString('latin1').replaceAll('xl/workbook.xml', 'word/doc.xmlxx'),
        'latin1',
      ),
    };
    const res = await send(examiner.cookie, docx);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'file', code: 'unsupported_file' }] });
  });

  it('xếp job lỗi (Redis hỏng) thì yêu cầu thành parse_failed, không kẹt ở "đang đọc"', async () => {
    t.queue.failNextEnqueue = true;
    const res = await send(examiner.cookie, csvFile('A,B1,,,,'));
    expect(res.statusCode).toBe(500);
    const [request] = (await get(examiner.cookie, '/api/account-requests')).json().items;
    expect(request).toMatchObject({ status: 'parse_failed', parseError: 'internal_error' });
    const uploads = await readdir(path.join(process.env.MEDIA_DIR as string, 'uploads')).catch(
      () => [],
    );
    expect(uploads).toEqual([]);
  });

  it('quá 2 MB bị từ chối', async () => {
    const big = { filename: 'lon.csv', content: Buffer.alloc(2 * 1024 * 1024 + 1, 'a') };
    const res = await send(examiner.cookie, big);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'file', code: 'file_too_large' }] });
  });

  it('thiếu file', async () => {
    const res = await call(t.app, 'POST', '/api/account-requests', {
      cookie: examiner.cookie,
      body: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('lỗi cả file (thiếu cột Họ tên) thì yêu cầu thành parse_failed và báo cho người gửi', async () => {
    const file = { filename: 'sai.csv', content: Buffer.from('Email\na@b.vn', 'utf8') };
    const id = await submitted(examiner.cookie, file);
    const detail = (await get(examiner.cookie, `/api/account-requests/${id}`)).json();
    expect(detail).toMatchObject({ status: 'parse_failed', parseError: 'missing_columns' });
    const bell = (await get(examiner.cookie, '/api/notifications')).json();
    expect(bell.items).toMatchObject([
      { type: 'account_request.parse_failed', data: { requestId: id, error: 'missing_columns' } },
    ]);
  });
});

describe('ai thấy yêu cầu nào', () => {
  it('Người ra đề chỉ thấy yêu cầu của mình; Quản trị viên thấy tất cả và lọc theo trạng thái', async () => {
    const gv1 = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên Một' });
    const gv2 = await signedIn({ roleTags: ['examiner'], fullName: 'Giảng Viên Hai' });
    const admin = await signedIn({ isAdmin: true });
    const id1 = await submitted(gv1.cookie, csvFile('A,B1,,,,'));
    await submitted(gv2.cookie, csvFile('B,B2,,,,'));
    await submitted(gv2.cookie, { filename: 'sai.csv', content: Buffer.from('Email\nx@y.vn') });

    expect((await get(gv1.cookie, '/api/account-requests')).json().total).toBe(1);
    expect((await get(gv2.cookie, '/api/account-requests')).json().total).toBe(2);
    const all = (await get(admin.cookie, '/api/account-requests')).json();
    expect(all.total).toBe(3);
    expect(all.items.map((i: { requesterName: string }) => i.requesterName).sort()).toEqual([
      'Giảng Viên Hai',
      'Giảng Viên Hai',
      'Giảng Viên Một',
    ]);
    const failed = (await get(admin.cookie, '/api/account-requests?status=parse_failed')).json();
    expect(failed.total).toBe(1);

    expect((await get(gv2.cookie, `/api/account-requests/${id1}`)).statusCode).toBe(404);
    expect((await get(gv2.cookie, `/api/account-requests/${id1}/items`)).statusCode).toBe(404);
    expect((await get(admin.cookie, `/api/account-requests/${id1}`)).statusCode).toBe(200);
  });
});

describe('thông báo (Q95)', () => {
  it('yêu cầu mới báo cho mọi Quản trị viên chưa bị Xóa, không báo cho người gửi', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Lê Giảng Viên' });
    const admin1 = await signedIn({ isAdmin: true });
    const admin2 = await signedIn({ isAdmin: true });
    await seedUser({ isAdmin: true, removed: true });
    const id = await submitted(examiner.cookie, csvFile('A,B1,,,,', 'B,B2,,,,'));

    for (const admin of [admin1, admin2]) {
      const bell = (await get(admin.cookie, '/api/notifications')).json();
      expect(bell.unreadCount).toBe(1);
      expect(bell.items).toMatchObject([
        {
          type: 'account_request.submitted',
          readAt: null,
          data: { requestId: id, requesterName: 'Lê Giảng Viên', rowCount: 2 },
        },
      ]);
    }
    expect((await get(examiner.cookie, '/api/notifications')).json()).toEqual({
      unreadCount: 0,
      items: [],
    });
  });

  it('đánh dấu đã đọc một thông báo, rồi tất cả; không đụng được thông báo của người khác', async () => {
    const examiner = await signedIn({ roleTags: ['examiner'] });
    const admin1 = await signedIn({ isAdmin: true });
    const admin2 = await signedIn({ isAdmin: true });
    await submitted(examiner.cookie, csvFile('A,B1,,,,'));
    await submitted(examiner.cookie, csvFile('B,B2,,,,'));

    const mine = (await get(admin1.cookie, '/api/notifications')).json();
    expect(mine.unreadCount).toBe(2);
    const [first, second] = mine.items;

    // admin2 cố đánh dấu thông báo của admin1: không có tác dụng
    await call(t.app, 'POST', '/api/notifications/read', {
      cookie: admin2.cookie,
      body: { ids: [first.id] },
    });
    expect((await get(admin1.cookie, '/api/notifications')).json().unreadCount).toBe(2);

    const afterOne = await call(t.app, 'POST', '/api/notifications/read', {
      cookie: admin1.cookie,
      body: { ids: [first.id] },
    });
    expect(afterOne.json().unreadCount).toBe(1);
    const afterAll = await call(t.app, 'POST', '/api/notifications/read', {
      cookie: admin1.cookie,
      body: {},
    });
    expect(afterAll.json().unreadCount).toBe(0);
    expect(afterAll.json().items.every((i: { readAt: string | null }) => i.readAt)).toBe(true);
    expect(second.id).toBeTruthy();
    expect((await get(admin2.cookie, '/api/notifications')).json().unreadCount).toBe(2);
  });
});

describe('Quản trị viên Từ chối cả yêu cầu', () => {
  let examiner: Awaited<ReturnType<typeof signedIn>>;
  let admin: Awaited<ReturnType<typeof signedIn>>;
  beforeEach(async () => {
    examiner = await signedIn({ roleTags: ['examiner'] });
    admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
  });
  const reject = (cookie: string, id: string, note?: string) =>
    call(t.app, 'POST', `/api/account-requests/${id}/reject`, { cookie, body: { note } });

  it('chuyển sang rejected, ghi chú và nhật ký, báo cho người gửi', async () => {
    const id = await submitted(examiner.cookie, csvFile('A,B1,,,,', 'B,B2,,,,'));
    const res = await reject(admin.cookie, id, 'File sai lớp');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'rejected',
      reviewNote: 'File sai lớp',
      reviewedByName: 'Quản Trị',
    });
    expect((await itemsOf(admin.cookie, id)).map((i: { outcome: string }) => i.outcome)).toEqual([
      'rejected',
      'rejected',
    ]);

    const bell = (await get(examiner.cookie, '/api/notifications')).json();
    expect(bell.items).toMatchObject([
      { type: 'account_request.reviewed', data: { requestId: id, status: 'rejected' } },
    ]);
    const logs = (await get(admin.cookie, `/api/admin/audit-logs?entityId=${id}`)).json().items;
    expect(logs[0]).toMatchObject({
      action: 'account-request.reject',
      actorName: 'Quản Trị',
      before: { status: 'pending' },
      after: { status: 'rejected', reviewNote: 'File sai lớp' },
    });
  });

  it('Người ra đề không Từ chối được; yêu cầu không còn "chờ duyệt" thì INVALID_STATE', async () => {
    const id = await submitted(examiner.cookie, csvFile('A,B1,,,,'));
    expect((await reject(examiner.cookie, id)).statusCode).toBe(403);

    const parsing = await send(examiner.cookie, csvFile('B,B2,,,,'));
    expect((await reject(admin.cookie, parsing.json().id)).json()).toMatchObject({
      code: 'INVALID_STATE',
    });
    await t.queue.drain();

    expect((await reject(admin.cookie, id)).statusCode).toBe(200);
    expect((await reject(admin.cookie, id)).json()).toMatchObject({ code: 'INVALID_STATE' });
  });
});
