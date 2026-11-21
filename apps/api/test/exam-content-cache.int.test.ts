import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Nội dung Bộ đề đã Phát hành bất biến nên được nhớ trong bộ nhớ: nhiều Lượt, đọc đề và lưu bài chỉ đọc bản chụp một lần.

let t: TestApp;
let cookie: string;
let exam: DrawExamRef;
let sessionId: string;
const reads: string[] = [];
let restore: (() => void) | undefined;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedDrawExam(t, cookie, [{ points: [1, 1, 1] }, { points: [1, 1] }]);
  const created = await call(t.app, 'POST', '/api/sessions', {
    cookie,
    body: {
      examId: exam.id,
      title: 'Ca 1',
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'AB3K9X',
    },
  });
  sessionId = created.json().id;
  const ids: string[] = [];
  for (const name of ['sv1', 'sv2', 'sv3']) {
    ids.push((await seedUser({ username: name, code: name, roleTags: ['candidate'] })).id);
  }
  await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
    cookie,
    body: { userIds: ids },
  });
});
afterEach(() => restore?.());

/** Ghi lại các truy vấn đọc bản chụp câu hỏi của Bộ đề (`select ... "snapshot" ... from "exam_items"`). */
function watchSnapshotReads() {
  const original = pg.Client.prototype.query as (...a: unknown[]) => unknown;
  (pg.Client.prototype as unknown as { query: unknown }).query = function (
    this: unknown,
    ...args: unknown[]
  ) {
    const text =
      typeof args[0] === 'string' ? args[0] : ((args[0] as { text?: string })?.text ?? '');
    if (/"snapshot"/.test(text) && /from "exam_items"/.test(text) && /^select/i.test(text))
      reads.push(text);
    return original.apply(this, args);
  };
  restore = () => {
    (pg.Client.prototype as unknown as { query: unknown }).query = original;
  };
}

describe('nội dung Bộ đề đã Phát hành được nhớ trong bộ nhớ', () => {
  it('ba Người dự thi bắt đầu Lượt, đọc đề và lưu bài: bản chụp câu hỏi chỉ đọc từ cơ sở dữ liệu một lần', async () => {
    const takers: Taker[] = [];
    for (const name of ['sv1', 'sv2', 'sv3']) {
      const taker = await Taker.signIn(t, name);
      await taker.join('AB3K9X');
      takers.push(taker);
    }
    reads.length = 0;
    watchSnapshotReads();
    for (const taker of takers) {
      const start = await taker.call('POST', `/take/sessions/${sessionId}/start`);
      expect(start.statusCode, start.body).toBe(200);
      const attemptId = start.json().attempt.id as string;
      expect((await taker.call('GET', `/take/attempts/${attemptId}`)).statusCode).toBe(200);
      const itemId = start.json().sections[0].items[0].itemId as string;
      const saved = await taker.call('PUT', `/take/attempts/${attemptId}/responses`, {
        items: [{ itemId, clientSeq: 1, value: { optionId: 'o1' } }],
      });
      expect(saved.json().results).toEqual([{ itemId, status: 'saved' }]);
    }
    expect(reads).toHaveLength(1);
  });

  it('nội dung đệm không lẫn giữa các Bộ đề', async () => {
    const other = await publishedDrawExam(t, cookie, [{ points: [1, 1, 1, 1] }], 'Bộ đề khác');
    const created = await call(t.app, 'POST', '/api/sessions', {
      cookie,
      body: {
        examId: other.id,
        title: 'Ca 2',
        opensAt: '2026-11-02T07:00:00+07:00',
        closesAt: '2026-11-02T10:00:00+07:00',
        durationMinutes: 45,
        accessCode: 'ZZ3K9X',
      },
    });
    const otherSession = created.json().id as string;
    const user = (await seedUser({ username: 'sv9', code: 'sv9', roleTags: ['candidate'] })).id;
    await call(t.app, 'POST', `/api/sessions/${otherSession}/roster`, {
      cookie,
      body: { userIds: [user] },
    });
    await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
      cookie,
      body: { userIds: [user] },
    });
    const taker = await Taker.signIn(t, 'sv9');
    await taker.join('AB3K9X');
    await taker.join('ZZ3K9X');
    const a = (await taker.call('POST', `/take/sessions/${sessionId}/start`)).json();
    const b = (await taker.call('POST', `/take/sessions/${otherSession}/start`)).json();
    expect(a.sections.flatMap((s: { items: unknown[] }) => s.items)).toHaveLength(5);
    expect(b.sections.flatMap((s: { items: unknown[] }) => s.items)).toHaveLength(4);
  });
});
