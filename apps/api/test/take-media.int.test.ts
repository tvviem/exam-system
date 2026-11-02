import { textDoc } from '@exam/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login, upload } from './support/http';
import { jpeg } from './support/images';
import { singleChoice } from './support/question-bank';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Q219: Người dự thi xem ảnh của Bộ đề khi có Lượt đang làm trên đúng thiết bị đã gắn; question-bank không biết Lượt làm bài.

let t: TestApp;
let examiner: string;
let sessionId: string;
let imageId: string;
let otherImageId: string;
let an: Taker;
let binh: Taker;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: examiner, body });

async function image(seed: number): Promise<string> {
  const res = await upload(
    t.app,
    '/api/illustrations',
    { filename: 'h.jpg', content: await jpeg(400, 300, seed) },
    { cookie: examiner },
  );
  await t.queue.drain();
  return res.json().id as string;
}

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  const anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] });
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  imageId = await image(1);
  otherImageId = await image(2); // ảnh của chính người ra đề nhưng không nằm trong Bộ đề
  const topic = (await api('POST', '/topics', { name: 'Hình' })).json();
  const question = await api('POST', '/questions', {
    ...singleChoice(topic.id),
    stem: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Xem hình' }] },
        { type: 'image', attrs: { illustrationId: imageId, alt: 'Hình' } },
      ],
    },
  });
  expect(question.statusCode, question.body).toBe(201);
  const exam = (await api('POST', '/exams', { title: 'Có hình' })).json();
  const saved = await api('PUT', `/exams/${exam.id}`, {
    title: 'Có hình',
    instructions: textDoc(''),
    version: exam.version,
    sections: [
      {
        id: exam.sections[0].id,
        title: null,
        instructions: textDoc(''),
        items: [{ questionId: question.json().id, points: 1 }],
      },
    ],
  });
  await api('POST', `/exams/${exam.id}/publish`, { version: saved.json().version });
  sessionId = (
    await api('POST', '/sessions', {
      examId: exam.id,
      title: 'Ca 1',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'AB3K9X',
    })
  ).json().id;
  await api('POST', `/sessions/${sessionId}/roster`, { userIds: [anId] });
  an = await Taker.signIn(t, 'an');
  binh = await Taker.signIn(t, 'binh');
});

const media = (who: Taker, attemptId: string, id: string, size = 480, device?: string | null) =>
  who.call('GET', `/take-media/${attemptId}/${id}/${size}`, undefined, device);

async function startFor(who: Taker) {
  await who.join('AB3K9X');
  return (await who.call('POST', `/take/sessions/${sessionId}/start`)).json();
}

describe('ảnh cho Người dự thi', () => {
  it('Lượt đang làm trên đúng thiết bị xem được ảnh trong Bộ đề; đề trả về nêu ảnh và đường dẫn', async () => {
    const view = await startFor(an);
    expect(view.mediaBase).toBe(`/api/take-media/${view.attempt.id}`);
    expect(view.sections[0].items[0].illustrations.map((i: { id: string }) => i.id)).toEqual([
      imageId,
    ]);
    const res = await media(an, view.attempt.id, imageId);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toContain('private');
    expect(res.rawPayload.length).toBeGreaterThan(100);
  });

  it('không xem được: ảnh không thuộc Bộ đề, thiết bị khác, người khác, chưa gắn thiết bị', async () => {
    const view = await startFor(an);
    expect((await media(an, view.attempt.id, otherImageId)).statusCode).toBe(404);
    expect((await media(an, view.attempt.id, imageId, 480, 'thiet-bi-la')).statusCode).toBe(404);
    expect((await media(an, view.attempt.id, imageId, 480, null)).statusCode).toBe(404);
    expect((await media(binh, view.attempt.id, imageId)).statusCode).toBe(404);
  });

  it('Lượt đã nộp hoặc quá hạn thì không xem được nữa', async () => {
    const view = await startFor(an);
    await an.call('POST', `/take/attempts/${view.attempt.id}/submit`);
    expect((await media(an, view.attempt.id, imageId)).statusCode).toBe(404);
  });

  it('khu ảnh của Người ra đề vẫn chỉ cho Người ra đề; Người ra đề không dùng khu ảnh của Người dự thi', async () => {
    const view = await startFor(an);
    expect((await an.call('GET', `/media/${imageId}/480`)).statusCode).toBe(403);
    const asExaminer = await call(
      t.app,
      'GET',
      `/api/take-media/${view.attempt.id}/${imageId}/480`,
      { cookie: examiner },
    );
    expect(asExaminer.statusCode).toBe(403);
  });
});
