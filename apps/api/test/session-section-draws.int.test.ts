import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R2b (S2): bảng session_section_draws và trigger khóa, kiểm bằng SQL ghi trực tiếp (không qua API).

let t: TestApp;
let cookie: string;
let exam: DrawExamRef;
let other: DrawExamRef;
let sessionId: string;

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
  other = await publishedDrawExam(t, cookie, [{ points: [1, 1] }], 'Bộ đề khác');
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
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
});

const insert = (section: string, percent: string | number) =>
  sql(
    `insert into session_section_draws (session_id, section_id, percent) values ($1, $2, ${percent})`,
    [sessionId, section],
  );
const count = async () => (await sql(`select 1 from session_section_draws`)).length;

describe('session_section_draws: ghi đè tỷ lệ rút của Phiên thi', () => {
  it('ghi được khi chưa có Lượt; mỗi Phần một dòng; tỷ lệ từ 0 đến 100', async () => {
    await insert(exam.sectionIds[0] as string, 40.5);
    await insert(exam.sectionIds[1] as string, 0);
    expect(await count()).toBe(2);
    await expect(insert(exam.sectionIds[0] as string, 50)).rejects.toThrow(
      /duplicate|unique|pkey/i,
    );
    await sql(`delete from session_section_draws`);
    for (const bad of ['-0.01', '100.01'])
      await expect(insert(exam.sectionIds[0] as string, bad)).rejects.toThrow(/check/i);
  });

  it('Phần của Bộ đề khác bị từ chối', async () => {
    await expect(insert(other.sectionIds[0] as string, 50)).rejects.toThrow(/khong thuoc bo de/i);
    expect(await count()).toBe(0);
  });

  it('Phiên thi đã có Lượt thì không thêm, sửa, xóa dòng nào', async () => {
    await insert(exam.sectionIds[0] as string, 40);
    const user = await seedUser({ username: 'sv1', code: 'SV001', roleTags: ['candidate'] });
    await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
      cookie,
      body: { userIds: [user.id] },
    });
    const taker = await Taker.signIn(t, 'sv1');
    await taker.join('AB3K9X');
    expect((await taker.call('POST', `/take/sessions/${sessionId}/start`)).statusCode).toBe(200);

    await expect(insert(exam.sectionIds[1] as string, 50)).rejects.toThrow(/co luot lam bai/i);
    await expect(sql(`update session_section_draws set percent = 60`)).rejects.toThrow(
      /co luot lam bai/i,
    );
    await expect(sql(`delete from session_section_draws`)).rejects.toThrow(/co luot lam bai/i);
    expect(await count()).toBe(1);
  });

  it('xóa Phiên thi chưa có Lượt thì dòng đi theo', async () => {
    await insert(exam.sectionIds[0] as string, 40);
    await sql(`delete from session_roster where session_id = $1`, [sessionId]);
    await sql(`delete from sessions where id = $1`, [sessionId]);
    expect(await count()).toBe(0);
  });
});
