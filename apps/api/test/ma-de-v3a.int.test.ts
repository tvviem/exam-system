import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// V3a của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6, Q479): Danh sách dự thi cho biết Mã đề của từng người,
// đổi tay từng người, Chia lại cả Danh sách. Chạy trên PostgreSQL thật qua API.

let t: TestApp;
let cookie: string;

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
});

const settings = (examId: string, extra: Record<string, unknown> = {}) => ({
  examId,
  title: 'Ca 1',
  opensAt: '2026-11-02T07:00:00+07:00',
  closesAt: '2026-11-02T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...extra,
});
const createSession = (examId: string, extra: Record<string, unknown> = {}) =>
  call(t.app, 'POST', '/api/sessions', { cookie, body: settings(examId, extra) });
/** Bộ đề: Phần 1 có 5 câu rút mặc định 40 % (2 câu), Phần 2 có 2 câu lấy đủ. Mọi câu 1 điểm. */
const drawExam = (): Promise<DrawExamRef> =>
  publishedDrawExam(t, cookie, [{ points: [1, 1, 1, 1, 1], drawPercent: 40 }, { points: [1, 1] }]);

let seeded = 0;
/** Thêm `n` Người dự thi mới vào Danh sách của Phiên thi; trả id của họ. */
const addToRoster = async (sessionId: string, n: number): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const user = await seedUser({
      username: `sv${seeded}`,
      code: `SV${seeded}`,
      roleTags: ['candidate'],
    });
    seeded++;
    ids.push(user.id);
  }
  const res = await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
    cookie,
    body: { userIds: ids },
  });
  expect(res.statusCode, res.body).toBe(200);
  return ids;
};
/** Mã đề (số thứ tự) của từng người trong Danh sách; `null` nếu chưa gán. */
const assignment = async (sessionId: string): Promise<Map<string, number | null>> => {
  const rows = await sql<{ user_id: string; number: number | null }>(
    `select r.user_id, v.number from session_roster r
       left join session_variants v on v.id = r.variant_id where r.session_id = $1`,
    [sessionId],
  );
  return new Map(rows.map((r) => [r.user_id, r.number]));
};
const loads = (map: Map<string, number | null>, k: number) =>
  Array.from({ length: k }, (_, i) => [...map.values()].filter((n) => n === i + 1).length);

beforeEach(() => {
  seeded = 0;
});

const rosterOf = (id: string, who = cookie) =>
  call(t.app, 'GET', `/api/sessions/${id}/roster?pageSize=100`, { cookie: who });
const setVariant = (id: string, userId: string, number: number, who = cookie) =>
  call(t.app, 'PUT', `/api/sessions/${id}/roster/${userId}/variant`, {
    cookie: who,
    body: { number },
  });
const rebalance = (id: string, who = cookie) =>
  call(t.app, 'POST', `/api/sessions/${id}/variants/rebalance`, { cookie: who, body: {} });
const otherExaminer = async () => {
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  return (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
};
/** Người dự thi `index` (đã có trong Danh sách) vào thi và bắt đầu làm bài: có Lượt. */
const startAttempt = async (sessionId: string, index: number) => {
  const taker = await Taker.signIn(t, `sv${index}`);
  await taker.join('AB3K9X');
  expect((await taker.call('POST', `/take/sessions/${sessionId}/start`)).statusCode).toBe(200);
};

describe('Danh sách dự thi cho biết Mã đề của từng người', () => {
  it('Phiên thi 3 Mã đề: mỗi người kèm Mã đề (số, nhãn); tóm tắt số người từng Mã đề khớp, lệch tối đa 1', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    await addToRoster(id, 7);
    const res = await rosterOf(id);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(7);
    for (const item of body.items) {
      expect(item.variant).toMatchObject({ number: expect.any(Number), label: expect.any(String) });
      expect(item.variant.label).toBe(`Đề ${item.variant.number}`);
    }
    expect(body.variants.map((v: { number: number }) => v.number)).toEqual([1, 2, 3]);
    const counts = body.variants.map((v: { count: number }) => v.count);
    expect(counts.reduce((a: number, b: number) => a + b, 0)).toBe(7);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    // Khớp với từng dòng của danh sách.
    for (const v of body.variants) {
      expect(
        body.items.filter((i: { variant: { number: number } }) => i.variant.number === v.number),
      ).toHaveLength(v.count);
    }
  });

  it('Phiên thi mỗi người một đề: variant null và không có tóm tắt Mã đề', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id);
    const id = created.json().id;
    await addToRoster(id, 2);
    const body = (await rosterOf(id)).json();
    expect(body.items.every((i: { variant: unknown }) => i.variant === null)).toBe(true);
    expect(body.variants).toEqual([]);
  });

  it('Phiên thi một Mã đề: mọi người cùng Mã đề 1 (kể cả người chưa được gán sẵn)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    await addToRoster(id, 3);
    const body = (await rosterOf(id)).json();
    expect(body.variants).toEqual([{ number: 1, label: 'Đề 1', count: 3 }]);
    expect(body.items.every((i: { variant: { number: number } }) => i.variant.number === 1)).toBe(
      true,
    );
  });
});

describe('Đổi tay Mã đề của một người', () => {
  it('đổi được: Mã đề của người đó và số đếm thay đổi, người khác giữ nguyên', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const ids = await addToRoster(id, 6);
    const before = await assignment(id);
    const target = ids[0] as string;
    const to = ((before.get(target) as number) % 3) + 1; // một Mã đề khác
    const res = await setVariant(id, target, to);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      userId: target,
      variant: { number: to, label: `Đề ${to}` },
    });
    const after = await assignment(id);
    expect(after.get(target)).toBe(to);
    for (const [user, n] of before) if (user !== target) expect(after.get(user)).toBe(n);
    const list = (await rosterOf(id)).json();
    expect(list.variants.reduce((s: number, v: { count: number }) => s + v.count, 0)).toBe(6);
    expect(list.items.find((i: { userId: string }) => i.userId === target).variant.number).toBe(to);
  });

  it('Phiên thi một Mã đề: đặt Mã đề 1 được (không đổi gì), Mã đề khác thì 404', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const [userId] = await addToRoster(id, 1);
    expect((await setVariant(id, userId as string, 1)).statusCode).toBe(200);
    expect((await setVariant(id, userId as string, 2)).statusCode).toBe(404);
  });

  it('Mã đề không có: 404; Phiên thi mỗi người một đề: 409 NOT_SHARED; người ngoài Danh sách: 404; người ra đề khác: 404', async () => {
    const exam = await drawExam();
    const shared = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = shared.json().id;
    const [userId] = await addToRoster(id, 1);
    expect((await setVariant(id, userId as string, 5)).statusCode).toBe(404);
    const stranger = await seedUser({ username: 'ngoai', code: 'NGOAI', roleTags: ['candidate'] });
    expect((await setVariant(id, stranger.id, 1)).statusCode).toBe(404);
    expect((await setVariant(id, userId as string, 2, await otherExaminer())).statusCode).toBe(404);

    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    const [member] = await addToRoster(per.json().id, 1);
    const refused = await setVariant(per.json().id, member as string, 1);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_SHARED' });
  });

  it('người đã có Lượt: 409 HAS_ATTEMPTS; người chưa làm vẫn đổi được khi Phiên thi đã có người làm bài', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const ids = await addToRoster(id, 2);
    await startAttempt(id, 0);
    const before = await assignment(id);
    const started = ids[0] as string;
    const waiting = ids[1] as string;
    const other = (n: number | null) => (n === 1 ? 2 : 1);

    const refused = await setVariant(id, started, other(before.get(started) ?? null));
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'HAS_ATTEMPTS' });
    expect((await assignment(id)).get(started)).toBe(before.get(started));

    const ok = await setVariant(id, waiting, other(before.get(waiting) ?? null));
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await assignment(id)).get(waiting)).toBe(other(before.get(waiting) ?? null));
  });
});

describe('Chia lại cả Danh sách', () => {
  it('ghi đè các lần đổi tay: dồn hết về Đề 1 rồi Chia lại thì cân bằng (lệch tối đa 1)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const ids = await addToRoster(id, 9);
    for (const userId of ids) expect((await setVariant(id, userId, 1)).statusCode).toBe(200);
    expect(loads(await assignment(id), 3)).toEqual([9, 0, 0]);
    const res = await rebalance(id);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().variants.map((v: { count: number }) => v.count)).toEqual([3, 3, 3]);
    expect(loads(await assignment(id), 3)).toEqual([3, 3, 3]);
  });

  it('đã có Lượt: 409 HAS_ATTEMPTS và không đổi gì', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    await addToRoster(id, 4);
    await startAttempt(id, 0);
    const before = [...(await assignment(id))];
    const res = await rebalance(id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'HAS_ATTEMPTS' });
    expect([...(await assignment(id))]).toEqual(before);
  });

  it('mỗi người một đề: 409 NOT_SHARED; một Mã đề: 409 ONE_VARIANT; người ra đề khác: 404', async () => {
    const exam = await drawExam();
    const per = await createSession(exam.id);
    const refused = await rebalance(per.json().id);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_SHARED' });
    const one = await createSession(exam.id, { drawScope: 'shared', accessCode: 'ZZ3K9X' });
    const single = await rebalance(one.json().id);
    expect(single.statusCode, single.body).toBe(409);
    expect(single.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'ONE_VARIANT' });
    expect((await rebalance(one.json().id, await otherExaminer())).statusCode).toBe(404);
  });
});
