import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R2b-2 (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8, S5 đến S7): vào thi thật, mỗi Người dự thi nhận bộ câu rút theo
// tỷ lệ hiệu lực (ghi đè của Phiên thi, rồi mặc định của Bộ đề, rồi 100 %).

let t: TestApp;
let cookie: string;
let exam: DrawExamRef;
const names = ['sv1', 'sv2', 'sv3', 'sv4', 'sv5'];
const userIds: string[] = [];

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
  userIds.length = 0;
  for (const [index, username] of names.entries()) {
    userIds.push(
      (await seedUser({ username, code: `SV00${index + 1}`, roleTags: ['candidate'] })).id,
    );
  }
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  // Phần A: 10 câu 1 điểm, mặc định 40 % (mỗi người 4 câu); Phần B: 5 câu 2 điểm, không đặt (đủ 5 câu).
  exam = await publishedDrawExam(t, cookie, [
    { drawPercent: 40, points: Array(10).fill(1) },
    { points: Array(5).fill(2) },
  ]);
});

let codeSeq = 0;
/** Phiên thi đang mở quanh giờ hiện tại, cả năm người trong Danh sách; mã vào thi riêng để nhiều Phiên thi không chồng. */
async function makeSession(over: Record<string, unknown> = {}, examId = exam.id) {
  const accessCode = `RC${String(++codeSeq).padStart(2, '0')}X9`;
  const created = await call(t.app, 'POST', '/api/sessions', {
    cookie,
    body: {
      examId,
      title: `Ca ${codeSeq}`,
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      maxAttempts: 3,
      accessCode,
      ...over,
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const sessionId = created.json().id as string;
  const roster = await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
    cookie,
    body: { userIds },
  });
  expect(roster.statusCode, roster.body).toBeLessThan(300);
  return { sessionId, accessCode };
}

async function enter(name: string, session: { sessionId: string; accessCode: string }) {
  const taker = await Taker.signIn(t, name);
  await taker.join(session.accessCode);
  const res = await taker.call('POST', `/take/sessions/${session.sessionId}/start`);
  expect(res.statusCode, res.body).toBe(200);
  return { taker, view: res.json(), attemptId: res.json().attempt.id as string };
}

interface StoredLayout {
  sections: { sectionId: string; items: { itemId: string }[] }[];
}
const layoutOf = async (attemptId: string) =>
  (await sql<{ layout: StoredLayout }>(`select layout from attempts where id = $1`, [attemptId]))[0]
    ?.layout as StoredLayout;
const itemsOf = async (attemptId: string, section: number) =>
  (await layoutOf(attemptId)).sections[section]?.items.map((item) => item.itemId) ?? [];
const originalIndex = (itemId: string) => exam.itemIds.indexOf(itemId);

describe('vào thi: mỗi Người dự thi nhận bộ câu rút theo tỷ lệ hiệu lực (S5)', () => {
  it('Phần A (40 % của 10) rút đúng 4 câu, Phần B (100 %) đủ 5 câu; câu thuộc đúng Phần và giữ thứ tự gốc', async () => {
    const session = await makeSession();
    const { attemptId } = await enter('sv1', session);
    const a = await itemsOf(attemptId, 0);
    const b = await itemsOf(attemptId, 1);
    expect(a).toHaveLength(4);
    expect(b).toEqual(exam.itemIds.slice(10));
    expect(a.every((id) => exam.itemIds.slice(0, 10).includes(id))).toBe(true);
    expect(new Set(a).size).toBe(4);
    expect(a.map(originalIndex)).toEqual([...a.map(originalIndex)].sort((x, y) => x - y));
  });

  it('người khác nhau nhận bộ câu khác nhau (rút ngẫu nhiên thật)', async () => {
    const session = await makeSession();
    const sets = new Set<string>();
    for (const name of names)
      sets.add((await itemsOf((await enter(name, session)).attemptId, 0)).join());
    expect(sets.size).toBeGreaterThan(1);
  });

  it('vào lại giữa chừng vẫn đúng Lượt; Lượt sau của cùng người ra đúng bộ câu cũ (Q389)', async () => {
    const session = await makeSession();
    const first = await enter('sv1', session);
    const again = await first.taker.call('POST', `/take/sessions/${session.sessionId}/start`);
    expect(again.json().attempt.id).toBe(first.attemptId);

    expect(
      (await first.taker.call('POST', `/take/attempts/${first.attemptId}/submit`)).statusCode,
    ).toBe(200);
    const second = await first.taker.call('POST', `/take/sessions/${session.sessionId}/start`);
    expect(second.statusCode, second.body).toBe(200);
    const secondId = second.json().attempt.id as string;
    expect(secondId).not.toBe(first.attemptId);
    expect(await itemsOf(secondId, 0)).toEqual(await itemsOf(first.attemptId, 0));
  });

  it('ghi đè ở Phiên thi thắng mặc định của Bộ đề: Phần A đặt 100 % thì lấy đủ 10 câu', async () => {
    const session = await makeSession({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 100 }],
    });
    expect(await itemsOf((await enter('sv1', session)).attemptId, 0)).toEqual(
      exam.itemIds.slice(0, 10),
    );
  });

  it('ghi đè xuống tỷ lệ khác: Phần B đặt 60 % của 5 câu thì rút 3 câu', async () => {
    const session = await makeSession({
      sectionDraws: [{ sectionId: exam.sectionIds[1], percent: 60 }],
    });
    const { attemptId } = await enter('sv1', session);
    expect(await itemsOf(attemptId, 0)).toHaveLength(4);
    expect(await itemsOf(attemptId, 1)).toHaveLength(3);
  });

  it('Phần 0 % không có câu nào và màn làm bài không hiện Phần rỗng; số thứ tự câu liền mạch', async () => {
    const session = await makeSession({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 0 }],
    });
    const { view, attemptId } = await enter('sv1', session);
    expect(await itemsOf(attemptId, 0)).toEqual([]);
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].items.map((item: { no: number }) => item.no)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('câu không được rút không bao giờ lộ và không ghi được (S6)', () => {
  it('không câu nào ngoài bố cục xuất hiện trong phản hồi bắt đầu hay xem Lượt', async () => {
    const session = await makeSession();
    const { taker, view, attemptId } = await enter('sv1', session);
    const drawn = new Set(await itemsOf(attemptId, 0));
    const viewAgain = (await taker.call('GET', `/take/attempts/${attemptId}`)).json();
    for (const body of [view, viewAgain]) {
      const text = JSON.stringify(body);
      exam.itemIds.slice(0, 10).forEach((itemId, index) => {
        const shown = text.includes(`"Câu ${index + 1}"`);
        expect(shown, `Câu ${index + 1}`).toBe(drawn.has(itemId));
        expect(text.includes(itemId)).toBe(drawn.has(itemId));
      });
    }
  });

  it('lưu câu trả lời cho câu ngoài bố cục bị từ chối (unknown_item), không ghi gì; câu trong bố cục lưu được', async () => {
    const session = await makeSession();
    const { taker, attemptId } = await enter('sv1', session);
    const inside = (await itemsOf(attemptId, 0))[0] as string;
    const drawn = new Set(await itemsOf(attemptId, 0));
    const outside = exam.itemIds.slice(0, 10).find((id) => !drawn.has(id)) as string;

    const res = await taker.call('PUT', `/take/attempts/${attemptId}/responses`, {
      items: [
        { itemId: outside, clientSeq: 1, value: { optionId: 'o1' } },
        { itemId: inside, clientSeq: 1, value: { optionId: 'o1' } },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().results).toEqual([
      { itemId: outside, status: 'rejected', reason: 'unknown_item' },
      { itemId: inside, status: 'saved' },
    ]);
    expect(
      (await sql<{ item_id: string }>(`select item_id from responses`)).map((r) => r.item_id),
    ).toEqual([inside]);
  });
});

describe('tương thích: Bộ đề không cấu hình rút chạy y như trước (S7)', () => {
  it('Bộ đề mọi Phần 100 % (hoặc không đặt) và Phiên thi không ghi đè: mỗi người nhận đủ mọi câu theo thứ tự gốc', async () => {
    const full = await publishedDrawExam(
      t,
      cookie,
      [{ points: Array(8).fill(1) }, { drawPercent: 100, points: Array(2).fill(3) }],
      'Bộ đề đủ câu',
    );
    const session = await makeSession({}, full.id);
    const { attemptId } = await enter('sv1', session);
    expect(await itemsOf(attemptId, 0)).toEqual(full.itemIds.slice(0, 8));
    expect(await itemsOf(attemptId, 1)).toEqual(full.itemIds.slice(8));
  });

  it('Bộ đề 40 câu một Phần ở 100 %: lấy đủ 40 câu (trường hợp dùng toàn bộ Bộ đề)', async () => {
    const forty = await publishedDrawExam(
      t,
      cookie,
      [{ points: Array(40).fill(1) }],
      'Bộ đề 40 câu',
    );
    const { attemptId } = await enter('sv2', await makeSession({}, forty.id));
    expect(await itemsOf(attemptId, 0)).toEqual(forty.itemIds);
  });
});
