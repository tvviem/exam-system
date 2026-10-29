import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let otherCookie: string;

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
});

const as = (
  who: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) => call(t.app, method, url, { cookie: who, body });
const mine = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
  as(cookie, method, url, body);

async function createTopic(name: string, who = cookie, description?: string) {
  const res = await as(who, 'POST', '/api/topics', { name, description });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; name: string };
}

describe('Chủ đề', () => {
  it('tạo, sửa và xem danh sách kèm số Câu hỏi; chỉ thấy Chủ đề của mình', async () => {
    const a = await createTopic('Giải tích 1', cookie, 'Chương 1–5');
    await createTopic('Đại số', cookie);
    await createTopic('Của người khác', otherCookie);
    await mine('POST', '/api/questions', singleChoice(a.id));

    const updated = await mine('PATCH', `/api/topics/${a.id}`, { name: 'Giải tích' });
    expect(updated.json()).toMatchObject({
      id: a.id,
      name: 'Giải tích',
      description: 'Chương 1–5',
    });

    const list = (await mine('GET', '/api/topics')).json();
    expect(list.map((x: { name: string }) => x.name)).toEqual(['Đại số', 'Giải tích']);
    expect(list.find((x: { id: string }) => x.id === a.id)).toMatchObject({
      questionCount: 1,
      archivedAt: null,
    });
  });

  it('tên không trùng với Chủ đề chưa lưu trữ của cùng chủ, không phân biệt hoa thường và dấu', async () => {
    const a = await createTopic('Giải tích');
    const dup = await mine('POST', '/api/topics', { name: ' giai  TICH ' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ code: 'CONFLICT', field: 'name' });

    const b = await createTopic('Đại số');
    const rename = await mine('PATCH', `/api/topics/${b.id}`, { name: 'GIẢI TÍCH' });
    expect(rename.statusCode).toBe(409);
    // Đổi tên thành chính tên mình (khác hoa thường) thì được.
    expect((await mine('PATCH', `/api/topics/${a.id}`, { name: 'GIẢI TÍCH' })).statusCode).toBe(
      200,
    );
    // Người khác dùng cùng tên thì được.
    await createTopic('Giải tích', otherCookie);
  });

  it('kiểm tra tên và mô tả', async () => {
    expect((await mine('POST', '/api/topics', { name: '   ' })).statusCode).toBe(400);
    expect((await mine('POST', '/api/topics', { name: 'x'.repeat(101) })).statusCode).toBe(400);
    expect(
      (await mine('POST', '/api/topics', { name: 'ok', description: 'x'.repeat(501) })).statusCode,
    ).toBe(400);
  });

  it('xóa Chủ đề rỗng; còn Câu hỏi thì từ chối', async () => {
    const empty = await createTopic('Rỗng');
    const full = await createTopic('Có câu');
    await mine('POST', '/api/questions', singleChoice(full.id));

    expect((await mine('DELETE', `/api/topics/${empty.id}`)).statusCode).toBe(200);
    const blocked = await mine('DELETE', `/api/topics/${full.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ code: 'INVALID_STATE', reason: 'TOPIC_NOT_EMPTY' });
    expect((await mine('GET', '/api/topics')).json()).toHaveLength(1);
  });

  it('Lưu trữ ẩn khỏi danh sách và nhả tên; khôi phục khi tên bị chiếm thì CONFLICT', async () => {
    const old = await createTopic('Giải tích');
    expect((await mine('POST', `/api/topics/${old.id}/archive`)).statusCode).toBe(200);
    expect((await mine('GET', '/api/topics')).json()).toEqual([]);
    const all = (await mine('GET', '/api/topics?includeArchived=true')).json();
    expect(all[0]).toMatchObject({ id: old.id });
    expect(all[0].archivedAt).not.toBeNull();

    await createTopic('Giải tích');
    const restore = await mine('POST', `/api/topics/${old.id}/restore`);
    expect(restore.statusCode).toBe(409);
    expect(restore.json()).toEqual({ code: 'CONFLICT', field: 'name' });
  });

  it('không thêm Câu hỏi vào Chủ đề đã lưu trữ', async () => {
    const topic = await createTopic('Cũ');
    await mine('POST', `/api/topics/${topic.id}/archive`);
    const res = await mine('POST', '/api/questions', singleChoice(topic.id));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ code: 'INVALID_STATE', reason: 'TOPIC_ARCHIVED' });
  });

  it('người khác nhận NOT_FOUND; Quản trị viên và Người dự thi bị chặn', async () => {
    const topic = await createTopic('Riêng tư');
    for (const [method, url] of [
      ['PATCH', `/api/topics/${topic.id}`],
      ['DELETE', `/api/topics/${topic.id}`],
      ['POST', `/api/topics/${topic.id}/archive`],
      ['POST', `/api/topics/${topic.id}/restore`],
    ] as const) {
      const res = await as(
        otherCookie,
        method,
        url,
        method === 'PATCH' ? { name: 'x' } : undefined,
      );
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }

    await seedUser({ username: 'qt', isAdmin: true });
    await seedUser({ username: 'sv', roleTags: ['candidate'] });
    for (const username of ['qt', 'sv']) {
      const who = (await login(t.app, username, DEFAULT_PASSWORD)).cookie as string;
      expect((await as(who, 'GET', '/api/topics')).statusCode).toBe(403);
    }
    expect((await call(t.app, 'GET', '/api/topics')).statusCode).toBe(401);
  });
});
