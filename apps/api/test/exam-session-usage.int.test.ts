import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { type ExamRef, publishedExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let cookie: string;
let exam: ExamRef;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: string, path: string, body?: unknown) =>
  call(t.app, method as 'GET', `/api${path}`, { cookie, body });

beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedExam(t, cookie);
});

const newSession = async (accessCode: string) => {
  const res = await api('POST', '/sessions', {
    examId: exam.id,
    title: `Ca ${accessCode}`,
    opensAt: '2026-11-10T08:00:00+07:00',
    closesAt: '2026-11-10T10:00:00+07:00',
    durationMinutes: 45,
    accessCode,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
};

describe('Bộ đề cho biết có bao nhiêu Phiên thi đang dùng (Q204)', () => {
  it('chi tiết và danh sách đếm Phiên thi chưa hủy', async () => {
    expect((await api('GET', `/exams/${exam.id}`)).json().sessionCount).toBe(0);
    await newSession('AAAA22');
    const second = await newSession('BBBB22');
    await newSession('CCCC22');
    await api('POST', `/sessions/${second}/cancel`, {});
    expect((await api('GET', `/exams/${exam.id}`)).json().sessionCount).toBe(2);
    const listed = (await api('GET', '/exams')).json().items as {
      id: string;
      sessionCount: number;
    }[];
    expect(listed.find((e) => e.id === exam.id)?.sessionCount).toBe(2);
  });

  it('Bộ đề nháp chưa có Phiên thi nào', async () => {
    const draft = (await api('POST', '/exams', { title: 'Nháp' })).json();
    expect(draft.sessionCount).toBe(0);
  });
});
