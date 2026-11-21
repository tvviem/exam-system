import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R4c (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.6): phía Người dự thi và Xem thử của Người ra đề khi Phiên thi rút câu.

let t: TestApp;
let cookie: string;
let otherCookie: string;
let exam: DrawExamRef;
let userId: string;

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
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  userId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  // Phần A: 10 câu × 1 điểm, mặc định 40 % (4 câu); Phần B: 5 câu × 2 điểm, lấy đủ.
  exam = await publishedDrawExam(t, cookie, [
    { drawPercent: 40, points: Array(10).fill(1) },
    { points: Array(5).fill(2) },
  ]);
});

const api = (method: 'GET' | 'POST', path: string, body?: unknown, who = cookie) =>
  call(t.app, method, `/api${path}`, { cookie: who, body });

let codeSeq = 0;
async function makeSession(over: Record<string, unknown> = {}, examId = exam.id) {
  const accessCode = `PV${String(++codeSeq).padStart(2, '0')}X9`;
  const created = await api('POST', '/sessions', {
    examId,
    title: `Ca ${codeSeq}`,
    opensAt: '2026-11-02T07:00:00+07:00',
    closesAt: '2026-11-02T10:00:00+07:00',
    durationMinutes: 45,
    accessCode,
    ...over,
  });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  await api('POST', `/sessions/${id}/roster`, { userIds: [userId] });
  return id;
}

interface Preview {
  draw: { count: number; total: number } | null;
  sections: { items: { itemId: string }[] }[];
}
const preview = async (sessionId: string, who = cookie) => {
  const res = await api('GET', `/sessions/${sessionId}/try`, undefined, who);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as Preview;
};

describe('Xem thử một lượt rút (Người ra đề)', () => {
  it('Phiên thi rút câu: một bộ mẫu 4 + 5 câu, kèm draw {count: 9, total: 15}', async () => {
    const view = await preview(await makeSession());
    expect(view.sections.map((s) => s.items.length)).toEqual([4, 5]);
    expect(view.draw).toEqual({ count: 9, total: 15 });
  });

  it('mỗi lần mở ra một bộ khác (rút ngẫu nhiên mới, không cố định theo người xem)', async () => {
    const id = await makeSession();
    const sets = new Set<string>();
    for (let i = 0; i < 8; i++) {
      sets.add((await preview(id)).sections[0]?.items.map((item) => item.itemId).join() as string);
    }
    expect(sets.size).toBeGreaterThan(1);
  });

  it('không rút câu (Bộ đề đủ, hoặc Phiên thi ghi đè 100 %): đủ 15 câu và draw là null, như trước', async () => {
    const full = await makeSession({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 100 }],
    });
    const view = await preview(full);
    expect(view.sections.map((s) => s.items.length)).toEqual([10, 5]);
    expect(view.draw).toBeNull();

    const plain = await publishedDrawExam(t, cookie, [{ points: Array(3).fill(1) }], 'Bộ đề đủ');
    const view2 = await preview(await makeSession({}, plain.id));
    expect(view2.sections.map((s) => s.items.length)).toEqual([3]);
    expect(view2.draw).toBeNull();
  });

  it('ghi đè ở Phiên thi đổi bộ mẫu: Phần B 60 % rút 3 câu', async () => {
    const view = await preview(
      await makeSession({ sectionDraws: [{ sectionId: exam.sectionIds[1], percent: 60 }] }),
    );
    expect(view.sections.map((s) => s.items.length)).toEqual([4, 3]);
    expect(view.draw).toEqual({ count: 7, total: 15 });
  });

  it('người khác vẫn nhận 404', async () => {
    const id = await makeSession();
    expect((await api('GET', `/sessions/${id}/try`, undefined, otherCookie)).statusCode).toBe(404);
  });
});

describe('danh sách Phiên thi của Người dự thi báo bài rút từ bao nhiêu câu', () => {
  const listItem = async (sessionId: string) => {
    const taker = await Taker.signIn(t, 'an');
    const res = await taker.call('GET', '/take/sessions');
    expect(res.statusCode, res.body).toBe(200);
    return res.json().items.find((i: { sessionId: string }) => i.sessionId === sessionId);
  };

  it('Phiên thi rút câu: questionCount 9 và drawnFrom 15 (Bộ đề có 15 câu)', async () => {
    const item = await listItem(await makeSession());
    expect(item).toMatchObject({ questionCount: 9, drawnFrom: 15 });
  });

  it('Phiên thi lấy đủ: drawnFrom là null (không nói là rút ngẫu nhiên)', async () => {
    const id = await makeSession({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 100 }],
    });
    const item = await listItem(id);
    expect(item).toMatchObject({ questionCount: 15, drawnFrom: null });
  });
});
