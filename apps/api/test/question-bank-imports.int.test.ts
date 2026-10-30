import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MEDIA_STORE, type MediaStore } from '../src/media/media-store';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { call, login, upload } from './support/http';
import { singleChoice } from './support/question-bank';
import { importCsv, importRow } from './support/question-import-files';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

type UploadFile = Parameters<typeof upload>[2];

let t: TestApp;
let cookie: string;
let otherCookie: string;
let adminCookie: string;
let topicId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  await seedUser({ username: 'qt', isAdmin: true });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  topicId = (
    await call(t.app, 'POST', '/api/topics', { cookie, body: { name: 'Giải tích' } })
  ).json().id;
});

const send = (file: UploadFile, fields: Record<string, string> = { topicId }, who = cookie) =>
  upload(t.app, '/api/question-imports', file, { cookie: who, fields });

/** Tải lên rồi chạy worker đọc file; trả về id lô. */
async function parsed(file: UploadFile, who = cookie) {
  const res = await send(file, { topicId }, who);
  expect(res.statusCode, res.body).toBe(201);
  await t.queue.drain();
  return res.json().id as string;
}

const detail = (id: string, who = cookie) =>
  call(t.app, 'GET', `/api/question-imports/${id}`, { cookie: who });
const items = (id: string, query = '', who = cookie) =>
  call(t.app, 'GET', `/api/question-imports/${id}/items${query}`, { cookie: who });
const select = (id: string, body: unknown, who = cookie) =>
  call(t.app, 'PATCH', `/api/question-imports/${id}/items`, { cookie: who, body });
const commit = (id: string, who = cookie) =>
  call(t.app, 'POST', `/api/question-imports/${id}/commit`, { cookie: who });
const questionsOf = async (id = topicId, who = cookie) =>
  (await call(t.app, 'GET', `/api/questions?topicId=${id}&pageSize=100`, { cookie: who })).json();

const tp = (n: number) => importRow(`Câu ${n}`, ['a', 'b', 'c'], 'B');

describe('tải file lên và đọc (Q123, Q146)', () => {
  it('tải file mẫu về', async () => {
    const res = await call(t.app, 'GET', '/api/question-imports/template', { cookie });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('nhận file, báo đang đọc, rồi sẵn sàng với số dòng hợp lệ, lỗi và chọn sẵn', async () => {
    const res = await send(importCsv(tp(1), importRow('Thiếu đáp án', ['a', 'b'], ''), tp(3)));
    expect(res.statusCode, res.body).toBe(201);
    const { id } = res.json();
    expect(res.json().status).toBe('parsing');
    expect((await detail(id)).json()).toMatchObject({ status: 'parsing', rowCount: null });

    await t.queue.drain();
    expect((await detail(id)).json()).toMatchObject({
      status: 'ready',
      originalFilename: 'cau-hoi.csv',
      topic: { id: topicId, name: 'Giải tích' },
      rowCount: 3,
      counts: { valid: 2, duplicate: 0, error: 1, selected: 2 },
    });
    // File tải lên đã xóa sau khi đọc: chỉ còn nội dung đã đổi trong các dòng.
    const [batch] = await sql<{ upload_key: string | null }>(
      'SELECT upload_key FROM question_import_batches WHERE id = $1',
      [id],
    );
    expect(batch?.upload_key).toBeNull();
  });

  it('liệt kê từng dòng với loại, lý do lỗi và nội dung để xem trước; lọc theo loại', async () => {
    const id = await parsed(importCsv(tp(1), importRow('Lỗi', ['a', 'b'], 'E'), tp(3)));
    const all = (await items(id)).json();
    expect(all.total).toBe(3);
    expect(
      all.items.map((i: { rowNumber: number; kind: string }) => [i.rowNumber, i.kind]),
    ).toEqual([
      [2, 'valid'],
      [3, 'error'],
      [4, 'valid'],
    ]);
    expect(all.items[0]).toMatchObject({
      type: 'single_choice',
      selected: true,
      defaultPoints: 1,
      payload: { key: ['o2'] },
    });
    expect(all.items[1]).toMatchObject({
      errorCode: 'answer_mismatch',
      selected: false,
      type: null,
    });
    const errors = (await items(id, '?kind=error')).json();
    expect(errors.items.map((i: { rowNumber: number }) => i.rowNumber)).toEqual([3]);
  });

  it('nghi trùng: giống Câu hỏi đã có trong Chủ đề đích, hoặc giống một dòng trước trong file; mặc định không chọn', async () => {
    await call(t.app, 'POST', '/api/questions', {
      cookie,
      body: singleChoice(topicId, { stem: 'Đạo hàm của x² là gì?' }),
    });
    const existing = importRow('Đạo hàm của x² là gì?', ['x', '2x', 'x²'], 'B');
    const id = await parsed(importCsv(existing, tp(2), tp(2)));
    const rows = (await items(id)).json().items;
    expect(rows[0]).toMatchObject({ kind: 'duplicate', selected: false });
    expect(rows[0].duplicateOfQuestionId).toEqual(expect.any(String));
    expect(rows[1]).toMatchObject({ kind: 'valid', selected: true });
    expect(rows[2]).toMatchObject({ kind: 'duplicate', duplicateOfRow: 3, selected: false });
    expect((await detail(id)).json().counts).toMatchObject({ valid: 1, duplicate: 2, selected: 1 });
  });

  it('thiếu cột bắt buộc thì cả lô là parse_failed kèm mã lỗi', async () => {
    const res = await send({
      filename: 'sai.csv',
      content: Buffer.from('Nội dung,Phương án A\nx,y', 'utf8'),
      contentType: 'text/csv',
    });
    await t.queue.drain();
    expect((await detail(res.json().id)).json()).toMatchObject({
      status: 'parse_failed',
      parseError: 'missing_columns',
    });
  });

  it('từ chối ngay file không phải xlsx/csv, file quá lớn, thiếu Chủ đề', async () => {
    const binary = { filename: 'a.csv', content: Buffer.from([0, 1, 2, 3]) };
    expect((await send(binary)).json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'file', code: 'unsupported_file' }],
    });
    const big = { filename: 'a.csv', content: Buffer.alloc(2 * 1024 * 1024 + 1, 'a') };
    expect((await send(big)).statusCode).toBe(400);
    expect((await send(importCsv(tp(1)), {})).json()).toMatchObject({
      issues: [{ path: 'topicId' }],
    });
  });

  it('Chủ đề của người khác là NOT_FOUND, Chủ đề đã lưu trữ là INVALID_STATE', async () => {
    expect((await send(importCsv(tp(1)), { topicId }, otherCookie)).statusCode).toBe(404);
    await call(t.app, 'POST', `/api/topics/${topicId}/archive`, { cookie });
    const res = await send(importCsv(tp(1)));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'TOPIC_ARCHIVED' });
  });

  it('không xếp được job thì lô không kẹt ở "đang đọc"', async () => {
    t.queue.failNextEnqueue = true;
    const res = await send(importCsv(tp(1)));
    expect(res.statusCode).toBe(500);
    const [batch] = await sql<{ status: string; parse_error: string }>(
      'SELECT status, parse_error FROM question_import_batches',
    );
    expect(batch).toMatchObject({ status: 'parse_failed', parse_error: 'internal_error' });
  });

  it('chạy lại job đọc file cho lô đã đọc xong thì không làm gì thêm', async () => {
    const id = await parsed(importCsv(tp(1), tp(2)));
    await t.app.get(JobRegistry).run('question-import.parse', { batchId: id });
    expect((await items(id)).json().total).toBe(2);
  });
});

describe('quyền xem lô', () => {
  it('người khác nhận NOT_FOUND ở mọi đường; Quản trị viên và người chưa đăng nhập bị từ chối', async () => {
    const id = await parsed(importCsv(tp(1)));
    for (const [method, path] of [
      ['GET', ''],
      ['GET', '/items'],
      ['PATCH', '/items'],
      ['POST', '/commit'],
    ] as const) {
      const res = await call(t.app, method, `/api/question-imports/${id}${path}`, {
        cookie: otherCookie,
        body: method === 'PATCH' ? { group: 'valid', selected: false } : undefined,
      });
      expect(res.statusCode, `${method} ${path}`).toBe(404);
    }
    expect((await detail(id, adminCookie)).statusCode).toBe(403);
    expect((await call(t.app, 'GET', `/api/question-imports/${id}`)).statusCode).toBe(401);
  });

  it('danh sách chỉ có lô của mình, mới nhất trước', async () => {
    await parsed(importCsv(tp(1)));
    await parsed(importCsv(tp(2), tp(3)));
    const mine = (await call(t.app, 'GET', '/api/question-imports', { cookie })).json();
    expect(mine.items.map((b: { rowCount: number }) => b.rowCount)).toEqual([2, 1]);
    expect(mine.items[0]).toMatchObject({ topicName: 'Giải tích', status: 'ready' });
    expect(
      (await call(t.app, 'GET', '/api/question-imports', { cookie: otherCookie })).json().total,
    ).toBe(0);
  });
});

describe('chọn dòng để tạo (Q146)', () => {
  it('bật, tắt theo nhóm hoặc theo id; dòng lỗi không chọn được', async () => {
    const dup = importRow('Trùng', ['a', 'b'], 'A');
    const id = await parsed(importCsv(tp(1), dup, dup, importRow('Lỗi', ['a'], 'A')));
    const rows = (await items(id)).json().items as { id: string; kind: string }[];
    const byKind = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.id);

    expect((await select(id, { group: 'duplicate', selected: true })).statusCode).toBe(200);
    expect((await detail(id)).json().counts.selected).toBe(3);
    await select(id, { itemIds: byKind('valid'), selected: false });
    expect((await detail(id)).json().counts.selected).toBe(1); // chỉ còn dòng nghi trùng
    await select(id, { group: 'valid', selected: true });
    expect((await detail(id)).json().counts.selected).toBe(3);

    const bad = await select(id, { itemIds: byKind('error'), selected: true });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ issues: [{ path: 'itemIds', code: 'item_has_error' }] });
    // Nhóm "valid" chỉ chạm tới dòng hợp lệ, không có dòng lỗi nào được chọn.
    expect((await items(id, '?kind=error')).json().items[0].selected).toBe(false);
  });

  it('id của lô khác hoặc không có thì bị từ chối', async () => {
    const id = await parsed(importCsv(tp(1)));
    const other = await parsed(importCsv(tp(2)));
    const foreign = (await items(other)).json().items[0].id;
    const res = await select(id, { itemIds: [foreign], selected: false });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'itemIds', code: 'unknown_item' }] });
  });

  it('phải nêu đúng một trong itemIds hoặc group', async () => {
    const id = await parsed(importCsv(tp(1)));
    expect((await select(id, { selected: true })).statusCode).toBe(400);
    expect((await select(id, { group: 'valid', itemIds: [], selected: true })).statusCode).toBe(
      400,
    );
  });
});

describe('xác nhận tạo Câu hỏi (Q146)', () => {
  it('tạo các dòng đã chọn vào Chủ đề đích, bỏ qua dòng không chọn, ghi nhật ký một lần', async () => {
    const id = await parsed(
      importCsv(
        importRow('Số nguyên tố?', ['2', '4', '7'], 'A,C', {
          points: '2',
          rule: 'Đúng hết',
          tags: 'Số học',
        }),
        tp(2),
        importRow('Lỗi', ['a', 'b'], ''),
      ),
    );
    await select(id, {
      itemIds: [(await items(id)).json().items[1].id],
      selected: false,
    });

    const res = await commit(id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ status: 'committing' });
    expect((await questionsOf()).total).toBe(0); // chưa tạo cho tới khi worker chạy

    await t.queue.drain();
    expect((await detail(id)).json()).toMatchObject({ status: 'committed', createdCount: 1 });
    const list = await questionsOf();
    expect(list.total).toBe(1);
    const created = (
      await call(t.app, 'GET', `/api/questions/${list.items[0].id}`, { cookie })
    ).json();
    expect(created).toMatchObject({
      type: 'multiple_choice',
      topicId,
      defaultPoints: 2,
      tags: ['số học'],
      payload: { key: ['o1', 'o3'], scoringRule: 'all_or_nothing' },
    });
    const outcomes = (await items(id)).json().items.map((i: { outcome: string }) => i.outcome);
    expect(outcomes).toEqual(['created', 'skipped', 'skipped']);

    const logs = await sql<{ action: string; after: unknown }>(
      "SELECT action, after FROM audit_logs WHERE action = 'question.import'",
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.after).toMatchObject({ created: 1, skipped: 2, topicId });
  });

  it('câu tạo ra tìm được không dấu như câu soạn tay', async () => {
    const id = await parsed(importCsv(importRow('Đạo hàm của hàm số', ['a', 'b'], 'A')));
    await commit(id);
    await t.queue.drain();
    const found = (
      await call(t.app, 'GET', `/api/questions?topicId=${topicId}&q=dao%20ham`, { cookie })
    ).json();
    expect(found.total).toBe(1);
  });

  it('xác nhận hai lần chỉ chạy một lần; chạy lại job cũng không tạo trùng', async () => {
    const id = await parsed(importCsv(tp(1), tp(2)));
    expect((await commit(id)).statusCode).toBe(200);
    const again = await commit(id);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'INVALID_STATE' });
    await t.queue.drain();
    await t.app.get(JobRegistry).run('question-import.commit', {
      batchId: id,
      actorId: 'x',
      actorIp: null,
    });
    expect((await questionsOf()).total).toBe(2);
    expect((await commit(id)).statusCode).toBe(409);
  });

  it('không chọn dòng nào thì không xác nhận được', async () => {
    const id = await parsed(importCsv(tp(1)));
    await select(id, { group: 'valid', selected: false });
    const res = await commit(id);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ issues: [{ path: 'itemIds', code: 'nothing_selected' }] });
    expect((await detail(id)).json().status).toBe('ready');
  });

  it('lô chưa đọc xong hoặc đọc lỗi thì không xác nhận được, và không sửa lựa chọn được', async () => {
    const res = await send(importCsv(tp(1)));
    const id = res.json().id;
    expect((await commit(id)).statusCode).toBe(409);
    expect((await select(id, { group: 'valid', selected: false })).statusCode).toBe(409);
  });

  it('Chủ đề bị lưu trữ trước khi xác nhận: từ chối, lô giữ nguyên', async () => {
    const id = await parsed(importCsv(tp(1)));
    await call(t.app, 'POST', `/api/topics/${topicId}/archive`, { cookie });
    const res = await commit(id);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'TOPIC_ARCHIVED' });
    expect((await detail(id)).json().status).toBe('ready');
  });

  it('Chủ đề bị lưu trữ giữa lúc xếp job và lúc chạy: lô trở lại "ready", không tạo gì', async () => {
    const id = await parsed(importCsv(tp(1)));
    await commit(id);
    await call(t.app, 'POST', `/api/topics/${topicId}/archive`, { cookie });
    await t.queue.drain();
    expect((await detail(id)).json().status).toBe('ready');
    expect((await questionsOf()).total).toBe(0);
  });

  it('sau khi xác nhận không sửa được lựa chọn nữa', async () => {
    const id = await parsed(importCsv(tp(1)));
    await commit(id);
    await t.queue.drain();
    expect((await select(id, { group: 'valid', selected: false })).statusCode).toBe(409);
  });
});

describe('dọn dẹp hằng ngày', () => {
  const cleanup = () => t.app.get(JobRegistry).run('question-import.cleanup', {});

  it('xóa lô quá 30 ngày cùng các dòng của nó, giữ lô còn hạn', async () => {
    const old = await parsed(importCsv(tp(1)));
    t.clock.advance(31 * 24 * 60 * minutes(1));
    cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string; // phiên cũ đã hết hạn
    const fresh = await parsed(importCsv(tp(2)));
    await cleanup();
    expect((await detail(old)).statusCode).toBe(404);
    expect((await detail(fresh)).statusCode).toBe(200);
    const [count] = await sql<{ n: string }>(
      'SELECT count(*)::text AS n FROM question_import_items',
    );
    expect(Number(count?.n)).toBe(1);
  });

  it('lô kẹt ở "đang đọc" quá 15 phút (worker chết) thì thành parse_failed và xóa file tạm', async () => {
    const res = await send(importCsv(tp(1)));
    const media = t.app.get<MediaStore>(MEDIA_STORE);
    const key = `uploads/question-imports/${res.json().id}`;
    expect((await media.get(key)).length).toBeGreaterThan(0);
    t.queue.discard();
    t.clock.advance(minutes(16));
    await cleanup();
    await expect(media.get(key)).rejects.toThrow();
    expect((await detail(res.json().id)).json()).toMatchObject({
      status: 'parse_failed',
      parseError: 'internal_error',
    });
  });

  it('lô kẹt ở "đang tạo" quá 15 phút thì trở lại "ready" để xác nhận lại', async () => {
    const id = await parsed(importCsv(tp(1)));
    await commit(id);
    t.queue.discard();
    t.clock.advance(minutes(16));
    await cleanup();
    expect((await detail(id)).json().status).toBe('ready');
    expect((await commit(id)).statusCode).toBe(200);
    await t.queue.drain();
    expect((await questionsOf()).total).toBe(1);
  });
});
