import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { cluster, multipleChoice, singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

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

const essay = (topic: string) => ({
  type: 'essay',
  topicId: topic,
  stem: textDoc('Chứng minh định lý'),
  defaultPoints: 3,
  tags: [],
  payload: { maxLength: 500, rubric: textDoc('Tiêu chí chấm bí mật') },
});

async function examWithAllTypes() {
  const ids: string[] = [];
  for (const body of [
    singleChoice(topicId),
    multipleChoice(topicId),
    cluster(topicId),
    essay(topicId),
  ]) {
    const res = await call(t.app, 'POST', '/api/questions', { cookie, body });
    expect(res.statusCode, res.body).toBe(201);
    ids.push(res.json().id);
  }
  const created = (
    await call(t.app, 'POST', '/api/exams', { cookie, body: { title: 'Giữa kỳ' } })
  ).json();
  const saved = await call(t.app, 'PUT', `/api/exams/${created.id}`, {
    cookie,
    body: {
      title: 'Giữa kỳ',
      instructions: textDoc('Làm bài cẩn thận'),
      version: created.version,
      sections: [
        {
          id: created.sections[0].id,
          title: null,
          instructions: textDoc(''),
          items: ids.map((questionId, i) => ({ questionId, points: i + 1 })),
        },
      ],
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  return created.id as string;
}

const preview = (id: string, query = '', who = cookie) =>
  call(t.app, 'GET', `/api/exams/${id}/preview${query}`, { cookie: who });

describe('Xem thử Bộ đề (Q169, Q170)', () => {
  it('trả nội dung như Người dự thi thấy và không có Đáp án đúng ở cả hai chế độ', async () => {
    const id = await examWithAllTypes();
    for (const query of ['', '?showScoringRules=true']) {
      const res = await preview(id, query);
      expect(res.statusCode, res.body).toBe(200);
      for (const forbidden of ['"key"', 'rubric', 'bí mật']) {
        expect(res.body, `${query} ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('có Phần, số thứ tự, điểm và tổng điểm; quy tắc chấm chỉ hiện khi bật công tắc', async () => {
    const id = await examWithAllTypes();
    const off = (await preview(id)).json();
    expect(off).toMatchObject({
      title: 'Giữa kỳ',
      status: 'draft',
      totals: { items: 4, points: 10 },
    });
    const items = off.sections[0].items;
    expect(items.map((i: { number: number; points: number }) => [i.number, i.points])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(items.map((i: { question: { type: string } }) => i.question.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'true_false_cluster',
      'essay',
    ]);
    expect(items[1].question.payload).not.toHaveProperty('scoringRule');
    const on = (await preview(id, '?showScoringRules=true')).json();
    expect(on.sections[0].items[1].question.payload.scoringRule).toBe('proportional');
    expect(on.sections[0].items[2].question.payload.ladder).toEqual([0, 0.25, 1]);
  });

  it('lấy nội dung hiện tại của Câu hỏi (Bộ đề nháp)', async () => {
    const id = await examWithAllTypes();
    const first = (await preview(id)).json().sections[0].items[0];
    const q = (await call(t.app, 'GET', `/api/questions/${first.questionId}`, { cookie })).json();
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = q;
    const updated = await call(t.app, 'PUT', `/api/questions/${q.id}`, {
      cookie,
      body: { ...rest, stem: textDoc('Phần dẫn đã sửa') },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const after = (await preview(id)).json().sections[0].items[0];
    expect(JSON.stringify(after.question.stem)).toContain('Phần dẫn đã sửa');
  });

  it('của người khác và Quản trị viên: NOT_FOUND và 403; chưa đăng nhập 401', async () => {
    const id = await examWithAllTypes();
    expect((await preview(id, '', otherCookie)).statusCode).toBe(404);
    expect((await preview(id, '', adminCookie)).statusCode).toBe(403);
    expect((await call(t.app, 'GET', `/api/exams/${id}/preview`)).statusCode).toBe(401);
    expect((await preview(id, '?showScoringRules=maybe')).statusCode).toBe(400);
  });
});
