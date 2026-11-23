import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// V4a của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6, Q471, Q474): Người dự thi thấy Mã đề của mình, Theo dõi
// và Excel Kết quả có Mã đề (Theo dõi lọc được). Chạy trên PostgreSQL thật qua API.

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

beforeEach(() => {
  seeded = 0;
});

/** Người dự thi `index` đã có trong Danh sách: vào thi (nhập Mã vào thi) và trả về cách gọi của họ. */
const joined = async (index: number) => {
  const taker = await Taker.signIn(t, `sv${index}`);
  await taker.join('AB3K9X');
  return taker;
};
const sessionItem = async (taker: Taker, sessionId: string) => {
  const res = await taker.call('GET', '/take/sessions');
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().items as { sessionId: string; variant?: unknown }[]).find(
    (i) => i.sessionId === sessionId,
  );
};

describe('Người dự thi thấy Mã đề của mình (Q471)', () => {
  it('Phiên thi 2 Mã đề: danh sách Phiên thi và màn làm bài nêu đúng Mã đề được gán, chỉ số và nhãn', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const ids = await addToRoster(id, 4);
    const assigned = await assignment(id);
    for (const [index, userId] of ids.entries()) {
      const taker = await joined(index);
      const number = assigned.get(userId) as number;
      const item = await sessionItem(taker, id);
      expect(item?.variant).toEqual({ number, label: `Đề ${number}` });
      const started = await taker.call('POST', `/take/sessions/${id}/start`);
      expect(started.statusCode, started.body).toBe(200);
      const attemptId = started.json().attempt.id as string;
      const view = await taker.call('GET', `/take/attempts/${attemptId}`);
      expect(view.statusCode, view.body).toBe(200);
      expect(view.json().variant).toEqual({ number, label: `Đề ${number}` });
    }
  });

  it('không lộ gì của người khác: phản hồi chỉ có số và nhãn của chính mình', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    await addToRoster(id, 2);
    const taker = await joined(0);
    const item = (await sessionItem(taker, id)) as { variant: Record<string, unknown> };
    expect(Object.keys(item.variant).sort()).toEqual(['label', 'number']);
  });

  it('Phiên thi 1 Mã đề, hay mỗi người một đề: không có Mã đề (null) ở danh sách và màn làm bài', async () => {
    const exam = await drawExam();
    const one = await createSession(exam.id, { drawScope: 'shared' });
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    for (const [session, code] of [
      [one, 'AB3K9X'],
      [per, 'ZZ3K9X'],
    ] as const) {
      const id = session.json().id;
      const user = await seedUser({
        username: `u-${code}`,
        code: `U-${code}`,
        roleTags: ['candidate'],
      });
      await call(t.app, 'POST', `/api/sessions/${id}/roster`, {
        cookie,
        body: { userIds: [user.id] },
      });
      const taker = await Taker.signIn(t, `u-${code}`);
      await taker.join(code);
      expect((await sessionItem(taker, id))?.variant).toBeNull();
      const started = await taker.call('POST', `/take/sessions/${id}/start`);
      expect(started.statusCode, started.body).toBe(200);
      const view = await taker.call('GET', `/take/attempts/${started.json().attempt.id}`);
      expect(view.json().variant).toBeNull();
    }
  });
});

describe('Theo dõi: Mã đề từng người và lọc theo Mã đề (Q474)', () => {
  const monitor = (id: string, query = '', who = cookie) =>
    call(t.app, 'GET', `/api/sessions/${id}/monitor${query}`, { cookie: who });

  it('mỗi người kèm Mã đề được gán; kèm số người từng Mã đề', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const ids = await addToRoster(id, 6);
    const assigned = await assignment(id);
    const res = await monitor(id);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.people).toHaveLength(6);
    for (const person of body.people as {
      userId: string;
      variant: { number: number; label: string };
    }[]) {
      const number = assigned.get(person.userId) as number;
      expect(person.variant).toEqual({ number, label: `Đề ${number}` });
    }
    expect(body.variants).toEqual(
      [1, 2, 3].map((n) => ({
        number: n,
        label: `Đề ${n}`,
        count: ids.filter((u) => assigned.get(u) === n).length,
      })),
    );
  });

  it('lọc variant=N: chỉ còn người của Mã đề đó; tóm tắt cả phòng không đổi', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const ids = await addToRoster(id, 5);
    const assigned = await assignment(id);
    const all = (await monitor(id)).json();
    for (const number of [1, 2]) {
      const res = await monitor(id, `?variant=${number}`);
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      const expected = ids.filter((u) => assigned.get(u) === number).sort();
      expect((body.people as { userId: string }[]).map((p) => p.userId).sort()).toEqual(expected);
      expect(body.summary).toEqual(all.summary); // tóm tắt luôn của cả phòng
    }
    expect((await monitor(id, '?variant=7')).json().people).toEqual([]);
    expect((await monitor(id, '?variant=abc')).statusCode).toBe(400);
  });

  it('Phiên thi 1 Mã đề hay mỗi người một đề: variant null, variants rỗng', async () => {
    const exam = await drawExam();
    const one = await createSession(exam.id, { drawScope: 'shared' });
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    for (const session of [one, per]) {
      await addToRoster(session.json().id, 2);
      const body = (await monitor(session.json().id)).json();
      expect(body.people.every((p: { variant: unknown }) => p.variant === null)).toBe(true);
      expect(body.variants).toEqual([]);
    }
  });

  it('người ra đề khác nhận 404', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    await seedUser({ username: 'gv2', roleTags: ['examiner'] });
    const other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
    expect((await monitor(created.json().id, '?variant=1', other)).statusCode).toBe(404);
  });
});

describe('Excel Kết quả có cột Mã đề (Q474)', () => {
  const sheetRows = async (id: string) => {
    const res = await call(t.app, 'GET', `/api/sessions/${id}/results.xlsx`, { cookie });
    expect(res.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const rows: string[][] = [];
    workbook
      .getWorksheet('Tổng hợp')
      ?.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? ''))));
    return rows;
  };

  it('Phiên thi 2 Mã đề: cột "Mã đề" ngay sau "Lớp", mỗi người ghi Mã đề của mình', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const ids = await addToRoster(id, 4);
    const assigned = await assignment(id);
    const rows = await sheetRows(id);
    const header = rows.find((r) => r[0] === 'Mã định danh') as string[];
    expect(header.slice(0, 5)).toEqual(['Mã định danh', 'Họ và tên', 'Lớp', 'Mã đề', 'Số Lượt']);
    for (const [index, userId] of ids.entries()) {
      const row = rows.find((r) => r[0] === `SV${index}`) as string[];
      expect(row[3], `SV${index}`).toBe(`Đề ${assigned.get(userId)}`);
    }
  });

  it('Phiên thi 1 Mã đề hay mỗi người một đề: có cột "Mã đề" nhưng để trống', async () => {
    const exam = await drawExam();
    const one = await createSession(exam.id, { drawScope: 'shared' });
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    for (const session of [one, per]) {
      await addToRoster(session.json().id, 1);
      const rows = await sheetRows(session.json().id);
      const header = rows.find((r) => r[0] === 'Mã định danh') as string[];
      expect(header[3]).toBe('Mã đề');
      expect((rows.find((r) => r[0]?.startsWith('SV')) as string[])[3]).toBe('');
    }
  });
});
