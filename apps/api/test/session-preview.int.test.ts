import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login, upload } from './support/http';
import { jpeg } from './support/images';
import { cluster, essay, multipleChoice, singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Q220, Q245–Q251: Người ra đề Xem thử Phiên thi của mình đúng như Người dự thi thấy, không ghi gì.

let t: TestApp;
let owner: string;
let other: string;
let sessionId: string;
let examId: string;
let imageId: string;
let otherImageId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (cookie: string, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie, body });
const asOwner = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  api(owner, method, path, body);

async function image(seed: number): Promise<string> {
  const res = await upload(
    t.app,
    '/api/illustrations',
    { filename: 'h.jpg', content: await jpeg(400, 300, seed) },
    { cookie: owner },
  );
  await t.queue.drain();
  return res.json().id as string;
}

const SESSION = {
  title: 'Giữa kỳ - ca 1',
  opensAt: '2026-11-02T07:00:00+07:00',
  closesAt: '2026-11-02T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
};

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] });
  owner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  imageId = await image(1);
  otherImageId = await image(2); // ảnh của chính Người ra đề nhưng không nằm trong Bộ đề
  const topic = (await asOwner('POST', '/topics', { name: 'Xem thử' })).json();
  const withImage = {
    ...singleChoice(topic.id),
    stem: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
        { type: 'image', attrs: { illustrationId: imageId, alt: 'Hình' } },
      ],
    },
  };
  const ids: string[] = [];
  for (const question of [
    withImage,
    multipleChoice(topic.id),
    cluster(topic.id),
    essay(topic.id),
  ]) {
    const created = await asOwner('POST', '/questions', question);
    expect(created.statusCode, created.body).toBe(201);
    ids.push(created.json().id);
  }
  const exam = (await asOwner('POST', '/exams', { title: 'Đề xem thử' })).json();
  const saved = await asOwner('PUT', `/exams/${exam.id}`, {
    title: 'Đề xem thử',
    instructions: textDoc('Làm bài cẩn thận'),
    version: exam.version,
    sections: [
      {
        id: exam.sections[0].id,
        title: null,
        instructions: textDoc(''),
        items: ids.map((questionId) => ({ questionId, points: 1 })),
      },
    ],
  });
  await asOwner('POST', `/exams/${exam.id}/publish`, { version: saved.json().version });
  examId = exam.id;
  const created = await asOwner('POST', '/sessions', { ...SESSION, examId: exam.id });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
});

const tryView = (cookie = owner, id = sessionId) => api(cookie, 'GET', `/sessions/${id}/try`);
const tryMedia = (cookie: string, id: string, size = 480) =>
  api(cookie, 'GET', `/sessions/${sessionId}/try-media/${id}/${size}`);

describe('Xem thử qua Phiên thi: nội dung', () => {
  it('chủ Phiên thi nhận đề như Người dự thi: đủ bốn câu, không có Đáp án đúng hay hướng dẫn chấm', async () => {
    const res = await tryView();
    expect(res.statusCode, res.body).toBe(200);
    const view = res.json();
    expect(view).toMatchObject({
      status: 'preview',
      session: { id: sessionId, title: 'Giữa kỳ - ca 1' },
      exam: { title: 'Đề xem thử' },
      durationMinutes: 45,
      mediaBase: `/api/sessions/${sessionId}/try-media`,
    });
    const items = view.sections.flatMap((s: { items: unknown[] }) => s.items);
    expect(items.map((i: { type: string }) => i.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'true_false_cluster',
      'essay',
    ]);
    expect(items.map((i: { no: number }) => i.no)).toEqual([1, 2, 3, 4]);
    expect(items.every((i: { response: unknown }) => i.response === null)).toBe(true);
    // Bất biến: Đáp án đúng chỉ ở server
    expect(res.body).not.toContain('"key"');
    expect(res.body).not.toContain('"rubric"');
    expect(res.body).not.toContain('ε-δ');
  });

  it('không ghi gì: không tạo Lượt làm bài, không gắn thiết bị', async () => {
    await tryView();
    await tryView();
    expect(await sql(`select 1 from attempts`)).toHaveLength(0);
    expect(await sql(`select 1 from session_devices`)).toHaveLength(0);
    expect(await sql(`select 1 from responses`)).toHaveLength(0);
  });

  it('xem thử được ở mọi trạng thái: chưa mở, đã đóng, đã Hủy', async () => {
    t.clock.set(new Date('2026-11-02T06:00:00+07:00'));
    expect((await tryView()).statusCode).toBe(200); // chưa mở
    t.clock.set(new Date('2026-11-02T11:00:00+07:00'));
    expect((await tryView()).statusCode).toBe(200); // đã đóng
    const cancelled = await asOwner('POST', `/sessions/${sessionId}/cancel`, {});
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect((await tryView()).statusCode).toBe(200); // đã Hủy
  });

  it('chỉ chủ Phiên thi: Người ra đề khác, Người dự thi, người chưa đăng nhập đều không thấy (404 hoặc 401)', async () => {
    expect((await tryView(other)).statusCode).toBe(404);
    const an = await Taker.signIn(t, 'an');
    expect((await tryView(an.cookie)).statusCode).toBe(404);
    expect((await tryView(owner, '0197a6f0-0000-7000-8000-000000000000')).statusCode).toBe(404);
    const anonymous = await call(t.app, 'GET', `/api/sessions/${sessionId}/try`, {});
    expect(anonymous.statusCode).toBe(401);
  });

  it('Người dự thi trong Danh sách cũng không Xem thử được và không bị lộ gì thêm', async () => {
    const anId = (await sql<{ id: string }>(`select id from users where username = 'an'`))[0]?.id;
    const added = await asOwner('POST', `/sessions/${sessionId}/roster`, { userIds: [anId] });
    expect(added.statusCode, added.body).toBe(200);
    const an = await Taker.signIn(t, 'an');
    const res = await tryView(an.cookie);
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('Đề xem thử');
  });
});

type Item = { type: string; payload: { options?: { id: string }[]; scoringRule?: string } };
const itemsOf = (view: { sections: { items: Item[] }[] }) => view.sections.flatMap((s) => s.items);
const orderOf = (items: Item[]) => items.map((item) => item.type).join();
const optionsOf = (items: Item[]) =>
  (items.find((item) => item.type === 'single_choice')?.payload.options ?? [])
    .map((option) => option.id)
    .join();

async function sessionWith(over: Record<string, unknown>) {
  const created = await asOwner('POST', '/sessions', {
    ...SESSION,
    examId,
    accessCode: 'ZK4M7P',
    ...over,
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json().id as string;
}

describe('Xem thử qua Phiên thi: theo thiết lập của Phiên thi', () => {
  it('không bật trộn thì đúng thứ tự gốc của Bộ đề ở mọi lần mở', async () => {
    for (let i = 0; i < 5; i++) {
      const items = itemsOf((await tryView()).json());
      expect(orderOf(items)).toBe('single_choice,multiple_choice,true_false_cluster,essay');
      expect(optionsOf(items)).toBe('o1,o2,o3');
    }
  });

  it('bật trộn câu và trộn Phương án thì mỗi lần mở một thứ tự khác', async () => {
    const id = await sessionWith({ shuffleItems: true, shuffleOptions: true });
    const orders = new Set<string>();
    const options = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const items = itemsOf((await tryView(owner, id)).json());
      expect(items).toHaveLength(4); // trộn không làm mất câu
      orders.add(orderOf(items));
      options.add(optionsOf(items));
    }
    expect(orders.size).toBeGreaterThan(1);
    expect(options.size).toBeGreaterThan(1);
    expect([...options].every((o) => o.split(',').sort().join() === 'o1,o2,o3')).toBe(true);
  });

  it('chỉ hiện quy tắc tính điểm khi Phiên thi bật `showScoringRules`', async () => {
    const hidden = itemsOf((await tryView()).json()).find((i) => i.type === 'multiple_choice');
    expect(hidden?.payload.scoringRule).toBeUndefined();
    const id = await sessionWith({ showScoringRules: true });
    const shown = itemsOf((await tryView(owner, id)).json()).find(
      (i) => i.type === 'multiple_choice',
    );
    expect(shown?.payload.scoringRule).toBe('proportional');
  });

  it('chủ Phiên thi đã mất thẻ Người ra đề thì không Xem thử được, cũng nhận 404', async () => {
    expect((await tryView()).statusCode).toBe(200);
    await sql(
      `delete from user_role_tags where tag = 'examiner' and user_id = (select id from users where username = 'gv1')`,
    );
    // Phiên đăng nhập cũ vẫn mang thẻ cũ: đăng nhập lại để nhận thẻ mới
    const again = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    const res = await tryView(again);
    expect(res.statusCode).toBe(404);
    expect((await tryMedia(again, imageId)).statusCode).toBe(404);
  });

  it('quản trị viên không Xem thử được Phiên thi của người khác', async () => {
    await seedUser({ username: 'qt', isAdmin: true, roleTags: ['examiner'] });
    const admin = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
    expect((await tryView(admin)).statusCode).toBe(404);
  });
});

describe('Xem thử qua Phiên thi: ảnh', () => {
  it('chủ Phiên thi xem được ảnh trong Bộ đề, qua đường dẫn mà đề nêu', async () => {
    const view = (await tryView()).json();
    expect(view.sections[0].items[0].illustrations.map((i: { id: string }) => i.id)).toEqual([
      imageId,
    ]);
    const res = await tryMedia(owner, imageId);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('private');
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });

  it('không xem được: ảnh ngoài Bộ đề, Người ra đề khác, Người dự thi', async () => {
    expect((await tryMedia(owner, otherImageId)).statusCode).toBe(404);
    expect((await tryMedia(other, imageId)).statusCode).toBe(404);
    const an = await Taker.signIn(t, 'an');
    expect((await tryMedia(an.cookie, imageId)).statusCode).toBe(404);
  });
});
