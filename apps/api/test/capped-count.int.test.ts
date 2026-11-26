import { LIST_TOTAL_CAP } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Số đếm có chặn (docs/plan/quy-mo-lon-thiet-ke.md mục 6.1, Q481): danh sách lớn chỉ đếm tới 10.000, báo `totalCapped`, và không
// lật quá 10.000 kết quả đầu. Dưới mức đó mọi thứ như cũ.

let t: TestApp;
let admin: string;
let examiner: string;
let examinerId: string;
let topicId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'qt', isAdmin: true });
  examinerId = (await seedUser({ username: 'gv', roleTags: ['examiner'] })).id;
  admin = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
  examiner = (await login(t.app, 'gv', DEFAULT_PASSWORD)).cookie as string;
  const topic = await call(t.app, 'POST', '/api/topics', {
    cookie: examiner,
    body: { name: 'Lớn' },
  });
  topicId = topic.json().id as string;
});

/** Thêm thẳng `count` Câu hỏi; câu số 1 mới nhất, nên trang n bắt đầu ở câu (n-1)*pageSize+1. */
const seedQuestions = (count: number) =>
  sql(
    `INSERT INTO questions (id, topic_id, owner_id, type, stem, payload, default_points, search_text, updated_at)
     SELECT gen_random_uuid(), $1, $2, 'essay',
       jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
         jsonb_build_array(jsonb_build_object('type','text','text','Câu ' || i))))),
       '{"maxLength": 100}', 1, 'cau ' || i, now() - (i || ' seconds')::interval
     FROM generate_series(1, $3::int) i`,
    [topicId, examinerId, count],
  );

const get = async (cookie: string, url: string) => {
  const res = await call(t.app, 'GET', url, { cookie });
  expect(res.statusCode, `${url} ${res.body}`).toBe(200);
  return res.json() as { total: number; totalCapped: boolean; items: { preview?: string }[] };
};

describe('Câu hỏi', () => {
  it('đúng 10.000 câu: đếm chính xác, không báo chặn', async () => {
    await seedQuestions(LIST_TOTAL_CAP);
    expect(await get(examiner, '/api/questions')).toMatchObject({
      total: 10_000,
      totalCapped: false,
    });
  });

  it('nhiều hơn 10.000: total dừng ở 10.000 kèm totalCapped, cả khi đang tìm', async () => {
    await seedQuestions(LIST_TOTAL_CAP + 5);
    for (const url of ['/api/questions', '/api/questions?q=cau', '/api/questions?type=essay']) {
      expect(await get(examiner, url), url).toMatchObject({ total: 10_000, totalCapped: true });
    }
    expect(await get(examiner, '/api/questions?q=cau%2010004')).toMatchObject({
      total: 1,
      totalCapped: false,
    });
  });

  it('không lật quá 10.000 kết quả đầu, kể cả khi cỡ trang không chia hết', async () => {
    await seedQuestions(LIST_TOTAL_CAP + 5);
    const last = await get(examiner, '/api/questions?page=500');
    expect(last.items).toHaveLength(20);
    expect(last.items.at(-1)?.preview).toBe('Câu 10000');
    expect((await get(examiner, '/api/questions?page=501')).items).toEqual([]);
    const uneven = await get(examiner, '/api/questions?pageSize=30&page=334');
    expect(uneven.items.map((i) => i.preview)).toHaveLength(10); // 333 trang x 30 = 9.990
    expect(uneven.items.at(-1)?.preview).toBe('Câu 10000');
  });
});

describe('danh sách của Quản trị viên', () => {
  it('Người dùng, Lịch sử đăng nhập, Nhật ký thao tác cùng quy tắc', async () => {
    await sql(
      `INSERT INTO users (id, username, full_name) SELECT gen_random_uuid(), 'nguoi' || i, 'Người ' || i FROM generate_series(1, $1::int) i`,
      [LIST_TOTAL_CAP + 1],
    );
    await sql(
      `INSERT INTO login_events (id, identifier_tried, success, at) SELECT gen_random_uuid(), 'x', false, now() FROM generate_series(1, $1::int)`,
      [LIST_TOTAL_CAP + 1],
    );
    await sql(
      `INSERT INTO audit_logs (action, entity_type, at) SELECT 'user.created', 'user', now() FROM generate_series(1, $1::int)`,
      [LIST_TOTAL_CAP + 1],
    );
    for (const url of ['/api/admin/users', '/api/admin/login-events', '/api/admin/audit-logs']) {
      expect(await get(admin, url), url).toMatchObject({ total: 10_000, totalCapped: true });
      expect((await get(admin, `${url}?page=501`)).items, url).toEqual([]);
    }
    expect(await get(admin, '/api/admin/users?q=nguoi10001')).toMatchObject({
      total: 1,
      totalCapped: false,
    });
  });
});
