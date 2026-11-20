import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R2b (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 8, S4): ghi đè tỷ lệ rút của Phần ở Phiên thi.

let t: TestApp;
let cookie: string;
let otherCookie: string;
let exam: DrawExamRef;

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
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherCookie = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  // Phần 1: 10 câu 1 điểm, mặc định 40 %; Phần 2: 4 câu 2 điểm, không đặt (100 %); Phần 3: 3 câu điểm lệch (1, 2, 3).
  exam = await publishedDrawExam(t, cookie, [
    { drawPercent: 40, points: Array(10).fill(1) },
    { points: Array(4).fill(2) },
    { points: [1, 2, 3] },
  ]);
});

const api = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  who = cookie,
) => call(t.app, method, `/api${path}`, { cookie: who, body });

const settings = (over: Record<string, unknown> = {}) => ({
  examId: exam.id,
  title: 'Giữa kỳ - ca 1',
  opensAt: '2026-11-10T08:00:00+07:00',
  closesAt: '2026-11-10T10:00:00+07:00',
  durationMinutes: 45,
  accessCode: 'AB3K9X',
  ...over,
});

const create = async (over: Record<string, unknown> = {}) => {
  const res = await api('POST', '/sessions', settings(over));
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
};

interface DrawRow {
  sectionId: string;
  title: string | null;
  itemCount: number;
  defaultPercent: number;
  overridePercent: number | null;
  percent: number;
  drawCount: number;
}
const rowsOf = (session: { sectionDraws: DrawRow[] }) => session.sectionDraws;
const overrideRows = (sessionId: string) =>
  sql<{ section_id: string; percent: string }>(
    `select section_id, percent from session_section_draws where session_id = $1 order by section_id`,
    [sessionId],
  );

describe('Phiên thi kế thừa tỷ lệ mặc định của Bộ đề (Q438)', () => {
  it('không ghi đè thì mỗi Phần hiện mặc định của Bộ đề, số câu rút mỗi người và không có dòng ghi đè', async () => {
    const session = await create();
    expect(rowsOf(session)).toEqual([
      expect.objectContaining({
        sectionId: exam.sectionIds[0],
        itemCount: 10,
        defaultPercent: 40,
        overridePercent: null,
        percent: 40,
        drawCount: 4,
      }),
      expect.objectContaining({
        sectionId: exam.sectionIds[1],
        itemCount: 4,
        defaultPercent: 100,
        overridePercent: null,
        percent: 100,
        drawCount: 4,
      }),
      expect.objectContaining({
        sectionId: exam.sectionIds[2],
        itemCount: 3,
        defaultPercent: 100,
        overridePercent: null,
        percent: 100,
        drawCount: 3,
      }),
    ]);
    expect(await overrideRows(session.id)).toHaveLength(0);
    expect(rowsOf((await api('GET', `/sessions/${session.id}`)).json())).toHaveLength(3);
  });
});

describe('ghi đè tỷ lệ khi tạo và sửa Phiên thi', () => {
  it('ghi đè thắng mặc định; đọc lại đúng cả tỷ lệ hiệu lực và số câu rút', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    const first = rowsOf(session)[0] as DrawRow;
    expect(first).toMatchObject({
      defaultPercent: 40,
      overridePercent: 70,
      percent: 70,
      drawCount: 7,
    });
    expect((await overrideRows(session.id)).map((r) => Number(r.percent))).toEqual([70]);
  });

  it('ghi đè bằng đúng mặc định thì không tạo dòng (vẫn là kế thừa)', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 40 }],
    });
    expect(rowsOf(session)[0]).toMatchObject({ overridePercent: null, percent: 40 });
    expect(await overrideRows(session.id)).toHaveLength(0);
  });

  it('0 % là giá trị thật: tắt hẳn một Phần khi các Phần khác còn câu', async () => {
    const session = await create({ sectionDraws: [{ sectionId: exam.sectionIds[1], percent: 0 }] });
    expect(rowsOf(session)[1]).toMatchObject({ overridePercent: 0, percent: 0, drawCount: 0 });
  });

  it('sửa: có sectionDraws thì thay toàn bộ; [] xóa hết về kế thừa; không nêu thì giữ nguyên', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    const put = (extra: Record<string, unknown>, version: number) =>
      api('PUT', `/sessions/${session.id}`, { ...settings(), version, ...extra });

    const replaced = await put(
      { sectionDraws: [{ sectionId: exam.sectionIds[1], percent: 50 }] },
      session.version,
    );
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(rowsOf(replaced.json()).map((r) => r.overridePercent)).toEqual([null, 50, null]);

    const kept = await put({}, replaced.json().version);
    expect(rowsOf(kept.json()).map((r) => r.overridePercent)).toEqual([null, 50, null]);

    const cleared = await put({ sectionDraws: [] }, kept.json().version);
    expect(rowsOf(cleared.json()).map((r) => r.overridePercent)).toEqual([null, null, null]);
    expect(await overrideRows(session.id)).toHaveLength(0);
  });

  it('Nhân bản Phiên thi mang theo các ghi đè', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    const copy = (await api('POST', `/sessions/${session.id}/duplicate`)).json();
    expect(rowsOf(copy)[0]).toMatchObject({ overridePercent: 70, percent: 70 });
  });

  it('xóa Phiên thi thì dòng ghi đè đi theo', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    expect((await api('DELETE', `/sessions/${session.id}`)).statusCode).toBeLessThan(300);
    expect(await sql(`select 1 from session_section_draws`)).toHaveLength(0);
  });
});

describe('kiểm tra khi lưu (Q388, Q440, Q441)', () => {
  const issues = (res: {
    json: () => { details?: { issues?: unknown[] }; issues?: unknown[] };
  }) => {
    const body = res.json();
    return (body.details?.issues ?? body.issues) as {
      path: string;
      code: string;
      sectionId?: string;
    }[];
  };

  it('Phần không thuộc Bộ đề của Phiên thi bị từ chối, không lưu gì', async () => {
    const other = await publishedDrawExam(t, cookie, [{ points: [1, 1] }], 'Bộ đề khác');
    const res = await api(
      'POST',
      '/sessions',
      settings({ sectionDraws: [{ sectionId: other.sectionIds[0], percent: 50 }] }),
    );
    expect(res.statusCode).toBe(400);
    expect(issues(res)).toEqual([
      expect.objectContaining({ path: 'sectionDraws', code: 'unknown_section' }),
    ]);
    expect(await sql(`select 1 from sessions`)).toHaveLength(0);
  });

  it('Phần rút dưới 100 % mà các câu khác điểm: từ chối, nêu Phần lệch và hướng Nhân bản Bộ đề', async () => {
    const res = await api(
      'POST',
      '/sessions',
      settings({ sectionDraws: [{ sectionId: exam.sectionIds[2], percent: 50 }] }),
    );
    expect(res.statusCode).toBe(400);
    expect(issues(res)).toEqual([
      expect.objectContaining({
        path: 'sectionDraws',
        code: 'draw_points_uneven',
        sectionId: exam.sectionIds[2],
      }),
    ]);
  });

  it('Phần lệch điểm nhưng vẫn để 100 % thì hợp lệ (rút đủ như hiện nay)', async () => {
    const res = await api(
      'POST',
      '/sessions',
      settings({ sectionDraws: [{ sectionId: exam.sectionIds[2], percent: 100 }] }),
    );
    expect(res.statusCode, res.body).toBe(201);
  });

  it('mọi Phần hiệu lực 0 % (kể cả do ghi đè Phần mặc định 40 %): từ chối', async () => {
    const res = await api(
      'POST',
      '/sessions',
      settings({
        sectionDraws: exam.sectionIds.map((sectionId) => ({ sectionId, percent: 0 })),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(issues(res)).toEqual([
      expect.objectContaining({ path: 'sectionDraws', code: 'draw_all_zero' }),
    ]);
  });

  it('sửa cũng kiểm như tạo, và không đổi gì khi bị từ chối', async () => {
    const session = await create();
    const res = await api('PUT', `/sessions/${session.id}`, {
      ...settings(),
      version: session.version,
      sectionDraws: [{ sectionId: exam.sectionIds[2], percent: 50 }],
    });
    expect(res.statusCode).toBe(400);
    expect(await overrideRows(session.id)).toHaveLength(0);
  });
});

describe('khóa khi đã có Lượt làm bài, và quyền', () => {
  async function startAttempt(sessionId: string) {
    const user = await seedUser({ username: 'sv1', code: 'SV001', roleTags: ['candidate'] });
    expect(
      (await api('POST', `/sessions/${sessionId}/roster`, { userIds: [user.id] })).statusCode,
    ).toBeLessThan(300);
    const taker = await Taker.signIn(t, 'sv1');
    await taker.join('AB3K9X');
    expect((await taker.call('POST', `/take/sessions/${sessionId}/start`)).statusCode).toBe(200);
  }

  it('đã có Lượt: đổi ghi đè bị 409 HAS_ATTEMPTS, nội dung không đổi; gửi lại đúng như cũ thì được', async () => {
    // Phiên thi đang mở quanh giờ hiện tại, để không phải dời đồng hồ (dời xa làm hết hạn đăng nhập).
    const open = {
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
    };
    const session = await create({
      ...open,
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    await startAttempt(session.id);
    const current = (await api('GET', `/sessions/${session.id}`)).json();
    const put = (sectionDraws: unknown) =>
      api('PUT', `/sessions/${session.id}`, {
        ...settings(open),
        version: current.version,
        sectionDraws,
      });

    const refused = await put([{ sectionId: exam.sectionIds[0], percent: 20 }]);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ reason: 'HAS_ATTEMPTS' });
    expect((await overrideRows(session.id)).map((r) => Number(r.percent))).toEqual([70]);

    expect((await put([{ sectionId: exam.sectionIds[0], percent: 70 }])).statusCode).toBe(200);
  });

  it('Người ra đề khác không thấy và không sửa được ghi đè (404)', async () => {
    const session = await create({
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 70 }],
    });
    expect((await api('GET', `/sessions/${session.id}`, undefined, otherCookie)).statusCode).toBe(
      404,
    );
    const res = await api(
      'PUT',
      `/sessions/${session.id}`,
      { ...settings(), version: session.version, sectionDraws: [] },
      otherCookie,
    );
    expect(res.statusCode).toBe(404);
  });
});
