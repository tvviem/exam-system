import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { cluster, essay, multipleChoice, singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

let t: TestApp;
let cookie: string;
let otherCookie: string;
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
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  topicId = await newTopic('Giải tích');
});

const as = (who: string, method: Method, url: string, body?: unknown) =>
  call(t.app, method, url, { cookie: who, body });
const mine = (method: Method, url: string, body?: unknown) => as(cookie, method, url, body);

async function newTopic(name: string, who = cookie) {
  const res = await as(who, 'POST', '/api/topics', { name });
  return res.json().id as string;
}
async function newQuestion(input: object, who = cookie) {
  const res = await as(who, 'POST', '/api/questions', input);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; version: number };
}

describe('tạo và đọc Câu hỏi', () => {
  it.each([
    ['chọn một', singleChoice],
    ['chọn nhiều', multipleChoice],
    ['chùm đúng/sai', cluster],
    ['tự luận', essay],
  ])('Câu %s: tạo rồi đọc lại đủ nội dung và đáp án, version 1', async (_name, build) => {
    const input = build(topicId);
    const created = await mine('POST', '/api/questions', input);
    expect(created.statusCode).toBe(201);
    const read = (await mine('GET', `/api/questions/${created.json().id}`)).json();
    expect(read).toMatchObject({
      topicId,
      type: input.type,
      stem: input.stem,
      payload: input.payload,
      defaultPoints: input.defaultPoints,
      tags: input.tags,
      version: 1,
    });
  });

  it('dữ liệu sai bị từ chối, không ghi gì', async () => {
    const bad = singleChoice(topicId, { defaultPoints: 0 });
    const res = await mine('POST', '/api/questions', bad);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_FAILED');
    const html = await mine('POST', '/api/questions', {
      ...singleChoice(topicId),
      stem: '<script>alert(1)</script>',
    });
    expect(html.statusCode).toBe(400);
    expect(await sql('SELECT 1 FROM questions')).toHaveLength(0);
  });

  it('Chủ đề của người khác hoặc không có thì NOT_FOUND', async () => {
    const theirs = await newTopic('Của họ', otherCookie);
    expect((await mine('POST', '/api/questions', singleChoice(theirs))).statusCode).toBe(404);
  });

  it('lưu văn bản tìm kiếm không dấu và tags đã chuẩn hóa', async () => {
    const q = await newQuestion(singleChoice(topicId, { tags: ['  Chương 2 '] }));
    const [row] = await sql<{ search_text: string; tags: string[] }>(
      'SELECT search_text, tags FROM questions WHERE id = $1',
      [q.id],
    );
    expect(row?.search_text).toContain('dao ham cua x');
    expect(row?.tags).toEqual(['chương 2']);
  });
});

describe('quyền sở hữu', () => {
  it('người khác không đọc, sửa, nhân bản, xóa; Quản trị viên và Người dự thi bị chặn', async () => {
    const q = await newQuestion(singleChoice(topicId));
    const update = singleChoice(topicId);
    for (const [method, url, body] of [
      ['GET', `/api/questions/${q.id}`, undefined],
      ['PUT', `/api/questions/${q.id}`, { ...update, version: 1 }],
      ['DELETE', `/api/questions/${q.id}`, undefined],
      ['POST', `/api/questions/${q.id}/duplicate`, undefined],
    ] as const) {
      expect((await as(otherCookie, method, url, body)).statusCode, `${method} ${url}`).toBe(404);
    }
    const list = (await as(otherCookie, 'GET', '/api/questions')).json();
    expect(list.items).toEqual([]);

    await seedUser({ username: 'qt', isAdmin: true });
    await seedUser({ username: 'sv', roleTags: ['candidate'] });
    for (const username of ['qt', 'sv']) {
      const who = (await login(t.app, username, DEFAULT_PASSWORD)).cookie as string;
      expect((await as(who, 'GET', `/api/questions/${q.id}`)).statusCode).toBe(403);
      expect((await as(who, 'GET', '/api/questions')).statusCode).toBe(403);
    }
  });
});

describe('sửa Câu hỏi', () => {
  it('thay toàn bộ nội dung, tăng version; có thể đổi loại và Chủ đề', async () => {
    const q = await newQuestion(singleChoice(topicId));
    const other = await newTopic('Đại số');
    const res = await mine('PUT', `/api/questions/${q.id}`, { ...essay(other), version: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: q.id, type: 'essay', topicId: other, version: 2 });
    const read = (await mine('GET', `/api/questions/${q.id}`)).json();
    expect(read.payload).toEqual(essay(other).payload);
  });

  it('version cũ (sửa từ hai nơi) bị CONFLICT và không ghi đè', async () => {
    const q = await newQuestion(singleChoice(topicId));
    await mine('PUT', `/api/questions/${q.id}`, {
      ...singleChoice(topicId, { stem: 'Bản mới' }),
      version: 1,
    });
    const stale = await mine('PUT', `/api/questions/${q.id}`, {
      ...singleChoice(topicId, { stem: 'Bản cũ' }),
      version: 1,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: 'CONFLICT', field: 'version' });
    const read = (await mine('GET', `/api/questions/${q.id}`)).json();
    expect(read.stem).toEqual(textDoc('Bản mới'));
    expect(read.version).toBe(2);
  });

  it('không chuyển sang Chủ đề đã lưu trữ', async () => {
    const q = await newQuestion(singleChoice(topicId));
    const archived = await newTopic('Cũ');
    await mine('POST', `/api/topics/${archived}/archive`);
    const res = await mine('PUT', `/api/questions/${q.id}`, {
      ...singleChoice(archived),
      version: 1,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ reason: 'TOPIC_ARCHIVED' });
  });
});

describe('danh sách, tìm và lọc', () => {
  it('mới sửa trước; trả bản xem nhanh, không trả đáp án; phân trang', async () => {
    const first = await newQuestion(singleChoice(topicId, { stem: 'Câu thứ nhất' }));
    await newQuestion(singleChoice(topicId, { stem: 'Câu thứ hai' }));
    await newQuestion(singleChoice(topicId, { stem: 'Câu thứ ba' }));
    await mine('PUT', `/api/questions/${first.id}`, {
      ...singleChoice(topicId, { stem: 'Câu thứ nhất (sửa)' }),
      version: 1,
    });

    const page1 = (await mine('GET', '/api/questions?pageSize=2')).json();
    expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page1.items.map((i: { preview: string }) => i.preview)).toEqual([
      'Câu thứ nhất (sửa)',
      'Câu thứ ba',
    ]);
    expect(page1.items[0]).toMatchObject({
      type: 'single_choice',
      topicName: 'Giải tích',
      version: 2,
    });
    expect(page1.items[0].payload).toBeUndefined();
    expect(JSON.stringify(page1)).not.toContain('"key"');
    const page2 = (await mine('GET', '/api/questions?pageSize=2&page=2')).json();
    expect(page2.items.map((i: { preview: string }) => i.preview)).toEqual(['Câu thứ hai']);
  });

  it('tìm không dấu và không phân biệt hoa thường; lọc theo Chủ đề, Loại, tag', async () => {
    const algebra = await newTopic('Đại số');
    await newQuestion(singleChoice(topicId, { stem: 'Đạo hàm của hàm số', tags: ['chương 3'] }));
    await newQuestion(multipleChoice(algebra));
    await newQuestion(essay(topicId));

    const ids = async (query: string) =>
      (await mine('GET', `/api/questions?${query}`)).json().items.length as number;
    expect(await ids('q=DAO%20HAM')).toBe(1);
    expect(await ids('q=đạo hàm')).toBe(1);
    expect(await ids('q=khong-co')).toBe(0);
    expect(await ids(`topicId=${algebra}`)).toBe(1);
    expect(await ids('type=essay')).toBe(1);
    expect(await ids('tag=chương%203')).toBe(1);
    expect(await ids(`topicId=${topicId}&type=essay`)).toBe(1);
    expect(await ids('q=%25')).toBe(0); // ký tự đặc biệt của LIKE được thoát
  });
});

describe('nhân bản, di chuyển, xóa', () => {
  it('nhân bản tạo Câu hỏi mới cùng nội dung, version 1', async () => {
    const q = await newQuestion(multipleChoice(topicId));
    const copy = await mine('POST', `/api/questions/${q.id}/duplicate`);
    expect(copy.statusCode).toBe(201);
    expect(copy.json().id).not.toBe(q.id);
    const a = (await mine('GET', `/api/questions/${q.id}`)).json();
    const b = (await mine('GET', `/api/questions/${copy.json().id}`)).json();
    expect({ ...b, id: a.id, createdAt: a.createdAt, updatedAt: a.updatedAt }).toEqual(a);
  });

  it('di chuyển nhiều Câu hỏi sang Chủ đề khác trong một thao tác', async () => {
    const dest = await newTopic('Đích');
    const a = await newQuestion(singleChoice(topicId));
    const b = await newQuestion(essay(topicId));
    const res = await mine('POST', '/api/questions/move', { ids: [a.id, b.id], topicId: dest });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ moved: 2 });
    expect((await mine('GET', `/api/questions?topicId=${dest}`)).json().total).toBe(2);
  });

  it('di chuyển lẫn Câu hỏi của người khác thì NOT_FOUND và không đổi gì', async () => {
    const dest = await newTopic('Đích');
    const mineQ = await newQuestion(singleChoice(topicId));
    const theirTopic = await newTopic('Của họ', otherCookie);
    const theirs = await newQuestion(singleChoice(theirTopic), otherCookie);
    const res = await mine('POST', '/api/questions/move', {
      ids: [mineQ.id, theirs.id],
      topicId: dest,
    });
    expect(res.statusCode).toBe(404);
    expect((await mine('GET', `/api/questions?topicId=${dest}`)).json().total).toBe(0);
  });

  it('xóa một Câu hỏi và xóa hàng loạt', async () => {
    const a = await newQuestion(singleChoice(topicId));
    const b = await newQuestion(essay(topicId));
    const c = await newQuestion(multipleChoice(topicId));
    expect((await mine('DELETE', `/api/questions/${a.id}`)).statusCode).toBe(200);
    expect((await mine('GET', `/api/questions/${a.id}`)).statusCode).toBe(404);
    const bulk = await mine('POST', '/api/questions/delete', { ids: [b.id, c.id] });
    expect(bulk.json()).toEqual({ deleted: 2 });
    expect((await mine('GET', '/api/questions')).json().total).toBe(0);
  });

  it('xóa hàng loạt lẫn Câu hỏi của người khác thì NOT_FOUND và không xóa gì', async () => {
    const mineQ = await newQuestion(singleChoice(topicId));
    const theirTopic = await newTopic('Của họ', otherCookie);
    const theirs = await newQuestion(singleChoice(theirTopic), otherCookie);
    const res = await mine('POST', '/api/questions/delete', { ids: [mineQ.id, theirs.id] });
    expect(res.statusCode).toBe(404);
    expect((await mine('GET', '/api/questions')).json().total).toBe(1);
  });
});
