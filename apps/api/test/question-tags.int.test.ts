import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedExam } from './support/exams';
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

const read = async (id: string) =>
  (await mine('GET', `/api/questions/${id}`)).json() as { tags: string[]; version: number };

describe('thêm, bỏ tag hàng loạt', () => {
  const apply = (body: unknown, who = cookie) =>
    mine('POST', '/api/questions/tags/apply', body, who);

  it('thêm và bỏ trong một thao tác, giữ thứ tự; chỉ câu thật sự đổi mới tăng version', async () => {
    const a = await newQuestion('A', ['chương 1', 'cũ']);
    const b = await newQuestion('B', ['vận dụng']);
    const res = await apply({ ids: [a, b], add: [' Vận  Dụng ', 'ôn tập'], remove: ['cũ'] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ changed: 2, skipped: 0 });
    expect(await read(a)).toMatchObject({ tags: ['chương 1', 'vận dụng', 'ôn tập'], version: 2 });
    expect(await read(b)).toMatchObject({ tags: ['vận dụng', 'ôn tập'], version: 2 });

    // Chạy lại: không câu nào đổi.
    expect((await apply({ ids: [a, b], add: ['ôn tập'], remove: ['cũ'] })).json()).toEqual({
      changed: 0,
      skipped: 0,
    });
    expect((await read(a)).version).toBe(2);
    // Câu đổi tag lên đầu danh sách "mới sửa trước".
    await apply({ ids: [a], add: ['mới'], remove: [] });
    expect((await mine('GET', '/api/questions')).json().items[0].preview).toBe('A');
  });

  it('câu sẽ quá 10 tag thì bỏ qua câu đó và báo số câu', async () => {
    const full = await newQuestion(
      'Đầy',
      Array.from({ length: 10 }, (_, k) => `t${k}`),
    );
    const other = await newQuestion('Trống', []);
    const res = await apply({ ids: [full, other], add: ['thêm'], remove: [] });
    expect(res.json()).toEqual({ changed: 1, skipped: 1 });
    expect((await read(full)).tags).toHaveLength(10);
    expect((await read(full)).version).toBe(1);
    // Bỏ một và thêm một thì vừa đủ.
    expect((await apply({ ids: [full], add: ['thêm'], remove: ['t0'] })).json()).toEqual({
      changed: 1,
      skipped: 0,
    });
  });

  it('lẫn câu của người khác thì NOT_FOUND và không đổi gì', async () => {
    const own = await newQuestion('A', []);
    const theirTopic = await newTopic('Của họ', otherCookie);
    const theirs = await newQuestion('X', [], theirTopic, otherCookie);
    const res = await apply({ ids: [own, theirs], add: ['x'], remove: [] });
    expect(res.statusCode).toBe(404);
    expect((await read(own)).tags).toEqual([]);
    expect((await apply({ ids: [own], add: ['x'], remove: [] }, otherCookie)).statusCode).toBe(404);
  });

  it('dữ liệu sai bị từ chối', async () => {
    const id = await newQuestion('A', []);
    for (const body of [
      { ids: [id], add: [], remove: [] },
      { ids: [id], add: ['x'], remove: ['X'] },
      { ids: [id], add: ['x'.repeat(31)], remove: [] },
      { ids: [], add: ['x'], remove: [] },
      { ids: [id], add: ['x'], remove: [], extra: 1 },
    ]) {
      expect((await apply(body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await read(id)).version).toBe(1);
  });

  it('Bộ đề đã Phát hành giữ nguyên bản chụp', async () => {
    const exam = await publishedExam(t, cookie);
    const snapshots = () =>
      sql<{ snapshot: unknown }>('SELECT snapshot FROM exam_items WHERE exam_id = $1 ORDER BY id', [
        exam.id,
      ]);
    const before = await snapshots();
    const ids = (
      await sql<{ question_id: string }>('SELECT question_id FROM exam_items WHERE exam_id = $1', [
        exam.id,
      ])
    ).map((row) => row.question_id);
    expect((await apply({ ids, add: ['sau phát hành'], remove: [] })).json().changed).toBe(
      ids.length,
    );
    expect(await snapshots()).toEqual(before);
  });
});

describe('đổi tên, gộp tag', () => {
  const rename = (body: unknown, who = cookie) =>
    mine('POST', '/api/questions/tags/rename', body, who);
  let a: string;
  let b: string;
  let elsewhere: string;
  let theirs: string;

  beforeEach(async () => {
    a = await newQuestion('A', ['chuong 2', 'ngăn xếp']);
    b = await newQuestion('B', ['chương 2', 'x', 'chuong 2']);
    elsewhere = await newQuestion('C', ['chuong 2'], secondTopicId);
    const topic = await newTopic('Của họ', otherCookie);
    theirs = await newQuestion('X', ['chuong 2'], topic, otherCookie);
  });

  it('xem trước chỉ đếm, không đổi gì', async () => {
    const res = await rename({ from: 'chuong 2', to: 'chương 2', topicId, dryRun: true });
    expect(res.json()).toEqual({ changed: 2 });
    expect((await read(a)).tags).toEqual(['chuong 2', 'ngăn xếp']);
  });

  it('trong một Chủ đề: đổi sang tag đã có là gộp, giữ vị trí đầu, không trùng', async () => {
    const res = await rename({ from: ' CHUONG 2 ', to: 'Chương 2', topicId });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ changed: 2 });
    expect(await read(a)).toMatchObject({ tags: ['chương 2', 'ngăn xếp'], version: 2 });
    expect((await read(b)).tags).toEqual(['chương 2', 'x']);
    expect((await read(elsewhere)).tags).toEqual(['chuong 2']);
  });

  it('mọi Chủ đề khi không nêu Chủ đề; kể cả câu đã Lưu trữ; không chạm câu người khác', async () => {
    await mine('POST', '/api/questions/archive', { ids: [elsewhere] });
    expect((await rename({ from: 'chuong 2', to: 'chương 2' })).json()).toEqual({ changed: 3 });
    expect((await read(elsewhere)).tags).toEqual(['chương 2']);
    const other = await mine('GET', `/api/questions/${theirs}`, undefined, otherCookie);
    expect(other.json().tags).toEqual(['chuong 2']);
  });

  it('tag không có thì không đổi gì; tên cũ trùng tên mới hay tên rỗng bị từ chối', async () => {
    expect((await rename({ from: 'không có', to: 'y' })).json()).toEqual({ changed: 0 });
    expect((await rename({ from: 'x', to: ' X ' })).statusCode).toBe(400);
    expect((await rename({ from: 'x', to: '  ' })).statusCode).toBe(400);
    expect((await rename({ from: 'x', to: 'y'.repeat(31) })).statusCode).toBe(400);
  });
});
