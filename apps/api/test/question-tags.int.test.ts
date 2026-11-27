import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { essay, singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Lọc theo nhiều tag và danh sách tag đang có (docs/plan/loc-nhieu-tag-thiet-ke.md mục 3).

let t: TestApp;
let cookie: string;
let otherCookie: string;
let topicId: string;
let secondTopicId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const mine = (method: 'GET' | 'POST', url: string, body?: unknown, who = cookie) =>
  call(t.app, method, url, { cookie: who, body });

async function newTopic(name: string, who = cookie) {
  return (await mine('POST', '/api/topics', { name }, who)).json().id as string;
}
async function newQuestion(stem: string, tags: string[], topic = topicId, who = cookie) {
  const res = await mine('POST', '/api/questions', singleChoice(topic, { stem, tags }), who);
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  await seedUser({ username: 'sv1', roleTags: ['candidate'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  topicId = await newTopic('Cấu trúc dữ liệu');
  secondTopicId = await newTopic('Cơ sở dữ liệu');
});

/** Phần dẫn của các câu khớp, xếp theo chữ cho dễ so. */
async function found(query: string) {
  const res = await mine('GET', `/api/questions?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().items as { preview: string }[]).map((item) => item.preview).sort();
}
const tagQuery = (tags: string[], extra = '') =>
  `${tags.map((tag) => `tag=${encodeURIComponent(tag)}`).join('&')}${extra}`;

describe('lọc theo nhiều tag', () => {
  beforeEach(async () => {
    await newQuestion('A', ['chương 1', 'nhận biết']);
    await newQuestion('B', ['chương 1', 'vận dụng', 'ngăn xếp']);
    await newQuestion('C', ['chương 2', 'vận dụng']);
    await newQuestion('D', ['chương 3', 'vận dụng', 'ngăn xếp']);
  });

  it('khớp tất cả (mặc định): cùng loại là "hoặc", khác loại là "và"', async () => {
    expect(await found(tagQuery(['chương 1', 'chương 2']))).toEqual(['A', 'B', 'C']);
    expect(await found(tagQuery(['chương 1', 'chương 2', 'vận dụng']))).toEqual(['B', 'C']);
    expect(await found(tagQuery(['nhận biết', 'vận dụng', 'chương 1']))).toEqual(['A', 'B']);
    expect(await found(tagQuery(['chương 1', 'vận dụng', 'ngăn xếp']))).toEqual(['B']);
  });

  it('khớp bất kỳ: có ít nhất một tag đã chọn', async () => {
    expect(await found(tagQuery(['chương 2', 'nhận biết'], '&tagMatch=any'))).toEqual(['A', 'C']);
  });

  it('một tag như trước vẫn chạy; tag được chuẩn hóa và bỏ trùng, tag rỗng bỏ qua', async () => {
    expect(await found('tag=%20Chương%20%20%202%20')).toEqual(['C']);
    expect(await found('tag=chương%202&tag=CHƯƠNG%202&tag=')).toEqual(['C']);
  });

  it('đi cùng bộ lọc khác; tổng số đúng', async () => {
    const res = await mine(
      'GET',
      `/api/questions?topicId=${topicId}&${tagQuery(['vận dụng'])}&q=b`,
    );
    expect(res.json()).toMatchObject({ total: 1, items: [{ preview: 'B' }] });
  });

  it('quá 20 tag hay chế độ khớp lạ bị từ chối', async () => {
    const many = Array.from({ length: 21 }, (_, k) => `chương ${k + 1}`);
    const tooMany = await mine('GET', `/api/questions?${tagQuery(many)}`);
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().code).toBe('VALIDATION_FAILED');
    expect((await mine('GET', '/api/questions?tag=a&tagMatch=maybe')).statusCode).toBe(400);
  });
});

describe('danh sách tag đang có', () => {
  const tags = async (query = '', who = cookie) => {
    const res = await mine('GET', `/api/questions/tags${query}`, undefined, who);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { tag: string; count: number }[];
  };

  beforeEach(async () => {
    await newQuestion('A', ['chương 1', 'nhận biết']);
    await newQuestion('B', ['chương 1', 'vận dụng']);
    await newQuestion('C', ['chương 2'], secondTopicId);
    const other = await newTopic('Của người khác', otherCookie);
    await newQuestion('X', ['bí mật'], other, otherCookie);
  });

  it('kèm số câu, nhiều câu đứng trước, chỉ câu của người gọi', async () => {
    expect(await tags()).toEqual([
      { tag: 'chương 1', count: 2 },
      { tag: 'chương 2', count: 1 },
      { tag: 'nhận biết', count: 1 },
      { tag: 'vận dụng', count: 1 },
    ]);
    expect((await tags('', otherCookie)).map((row) => row.tag)).toEqual(['bí mật']);
  });

  it('theo Chủ đề đang chọn và theo trạng thái Lưu trữ', async () => {
    expect(await tags(`?topicId=${secondTopicId}`)).toEqual([{ tag: 'chương 2', count: 1 }]);
    const archived = await newQuestion('Cũ', ['đã cất']);
    await mine('POST', '/api/questions/archive', { ids: [archived] });
    expect((await tags()).map((row) => row.tag)).not.toContain('đã cất');
    expect(await tags('?archived=true')).toEqual([{ tag: 'đã cất', count: 1 }]);
  });

  it('câu không tag thì danh sách rỗng; Chủ đề của người khác không lộ gì', async () => {
    const empty = await newTopic('Trống');
    await mine('POST', '/api/questions', essay(empty));
    expect(await tags(`?topicId=${empty}`)).toEqual([]);
    expect(await tags(`?topicId=${topicId}`, otherCookie)).toEqual([]);
  });

  it('Người dự thi và khách bị chặn', async () => {
    const candidate = (await login(t.app, 'sv1', DEFAULT_PASSWORD)).cookie as string;
    expect((await mine('GET', '/api/questions/tags', undefined, candidate)).statusCode).toBe(403);
    expect((await call(t.app, 'GET', '/api/questions/tags', {})).statusCode).toBe(401);
  });
});
