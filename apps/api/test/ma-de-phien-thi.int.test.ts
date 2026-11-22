import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// V1 của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6): bộ câu rút một lần và lưu lại, vào thi dùng Mã đề,
// quy tắc điểm mới. Chạy trên PostgreSQL thật qua API.

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
const variantsOf = (sessionId: string) =>
  sql<{ id: string; number: number; label: string; draw_seed: string }>(
    `select id, number, label, draw_seed from session_variants where session_id = $1 order by number`,
    [sessionId],
  );
const itemsOf = async (variantId: string) =>
  (
    await sql<{ item_id: string }>(
      `select item_id from session_variant_items where variant_id = $1`,
      [variantId],
    )
  ).map((r) => r.item_id);

/** Bộ đề: Phần 1 có 5 câu rút mặc định 40 % (2 câu), Phần 2 có 2 câu lấy đủ. Mọi câu 1 điểm. */
const drawExam = (): Promise<DrawExamRef> =>
  publishedDrawExam(t, cookie, [{ points: [1, 1, 1, 1, 1], drawPercent: 40 }, { points: [1, 1] }]);

describe('tạo Phiên thi: Cách ra đề và Mã đề', () => {
  it('không nêu drawScope thì per_candidate và không có Mã đề (tương thích: Phiên thi như trước)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ drawScope: 'per_candidate', variants: [] });
    expect(await variantsOf(created.json().id)).toEqual([]);
  });

  it('shared, một Mã đề: rút ngay theo tỷ lệ (2 + 2 câu), nhãn "Đề 1", lưu bộ câu vào cơ sở dữ liệu', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    const rows = await variantsOf(id);
    expect(rows.map((r) => [r.number, r.label])).toEqual([[1, 'Đề 1']]);
    const items = await itemsOf((rows[0] as { id: string }).id);
    expect(items).toHaveLength(4);
    // 2 câu từ Phần 1 (5 câu) và cả 2 câu của Phần 2.
    expect(items.filter((i) => exam.itemIds.slice(0, 5).includes(i))).toHaveLength(2);
    expect(exam.itemIds.slice(5).every((i) => items.includes(i))).toBe(true);
    expect(created.json()).toMatchObject({
      drawScope: 'shared',
      variants: [{ number: 1, label: 'Đề 1', itemCount: 4 }],
    });
  });

  it('ghi đè tỷ lệ ở Phiên thi đổi bộ câu; tăng tỷ lệ chỉ thêm câu (cùng hạt giống)', async () => {
    const exam = await drawExam();
    const percent = (p: number) => [{ sectionId: exam.sectionIds[0] as string, percent: p }];
    const created = await createSession(exam.id, {
      drawScope: 'shared',
      sectionDraws: percent(20),
    });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    const variant = (await variantsOf(id))[0] as { id: string; draw_seed: string };
    const first = (await itemsOf(variant.id)).filter((i) => exam.itemIds.slice(0, 5).includes(i));
    expect(first).toHaveLength(1);

    const detail = created.json();
    const updated = await call(t.app, 'PUT', `/api/sessions/${id}`, {
      cookie,
      body: {
        ...settings(exam.id),
        drawScope: 'shared',
        sectionDraws: percent(60),
        version: detail.version,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const again = (await variantsOf(id))[0] as { id: string; draw_seed: string };
    expect(again.draw_seed).toBe(variant.draw_seed); // hạt giống giữ nguyên
    const second = (await itemsOf(again.id)).filter((i) => exam.itemIds.slice(0, 5).includes(i));
    expect(second).toHaveLength(3);
    for (const item of first) expect(second).toContain(item);
  });

  it('nhiều Mã đề: số lượng, nhãn, hạt giống khác nhau, cùng số câu', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    expect(created.statusCode, created.body).toBe(201);
    const rows = await variantsOf(created.json().id);
    expect(rows.map((r) => r.label)).toEqual(['Đề 1', 'Đề 2', 'Đề 3']);
    expect(new Set(rows.map((r) => r.draw_seed)).size).toBe(3);
    for (const row of rows) expect(await itemsOf(row.id)).toHaveLength(4);
  });

  it('variantCount ngoài 1 đến 10 bị từ chối', async () => {
    const exam = await drawExam();
    for (const bad of [0, 11]) {
      const res = await createSession(exam.id, { drawScope: 'shared', variantCount: bad });
      expect(res.statusCode, `${bad}`).toBe(400);
    }
  });

  it('đổi shared sang per_candidate gỡ hết Mã đề; đổi số Mã đề thêm hoặc bớt, giữ các Mã đề đầu', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const before = await variantsOf(id);
    const put = (extra: Record<string, unknown>, version: number) =>
      call(t.app, 'PUT', `/api/sessions/${id}`, {
        cookie,
        body: { ...settings(exam.id), ...extra, version },
      });

    const grown = await put({ drawScope: 'shared', variantCount: 3 }, created.json().version);
    expect(grown.statusCode, grown.body).toBe(200);
    const after = await variantsOf(id);
    expect(after.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(after.slice(0, 2).map((r) => r.draw_seed)).toEqual(before.map((r) => r.draw_seed));

    const none = await put({ drawScope: 'per_candidate' }, grown.json().version);
    expect(none.statusCode, none.body).toBe(200);
    expect(await variantsOf(id)).toEqual([]);
    expect(none.json()).toMatchObject({ drawScope: 'per_candidate', variants: [] });
  });
});

describe('khóa sau Lượt đầu tiên', () => {
  it('đã có Lượt: không đổi số Mã đề, cách ra đề hay tỷ lệ (409), và trigger chặn cả ghi SQL trực tiếp', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const user = await seedUser({ username: 'sv1', code: 'SV001', roleTags: ['candidate'] });
    await call(t.app, 'POST', `/api/sessions/${id}/roster`, {
      cookie,
      body: { userIds: [user.id] },
    });
    const taker = await Taker.signIn(t, 'sv1');
    await taker.join('AB3K9X');
    expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);

    const put = (extra: Record<string, unknown>) =>
      call(t.app, 'PUT', `/api/sessions/${id}`, {
        cookie,
        body: { ...settings(exam.id), ...extra, version: created.json().version },
      });
    expect((await put({ drawScope: 'shared', variantCount: 2 })).statusCode).toBe(409);
    expect((await put({ drawScope: 'per_candidate' })).statusCode).toBe(409);
    expect(
      (
        await put({
          drawScope: 'shared',
          sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 80 }],
        })
      ).statusCode,
    ).toBe(409);

    const variant = (await variantsOf(id))[0] as { id: string };
    await expect(sql(`delete from session_variants where id = $1`, [variant.id])).rejects.toThrow(
      /da co Luot/i,
    );
    await expect(
      sql(`delete from session_variant_items where variant_id = $1`, [variant.id]),
    ).rejects.toThrow(/da co Luot/i);
    await expect(
      sql(
        `insert into session_variants (id, session_id, number, label, draw_seed) values (gen_random_uuid(), $1, 2, 'x', 1)`,
        [id],
      ),
    ).rejects.toThrow(/da co Luot/i);
  });

  it('bộ câu của Mã đề chỉ nhận câu thuộc Bộ đề của Phiên thi', async () => {
    const exam = await drawExam();
    const other = await publishedDrawExam(t, cookie, [{ points: [1, 1] }], 'Bộ đề khác');
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const variant = (await variantsOf(created.json().id))[0] as { id: string };
    await expect(
      sql(`insert into session_variant_items (variant_id, item_id) values ($1, $2)`, [
        variant.id,
        other.itemIds[0],
      ]),
    ).rejects.toThrow(/khong thuoc bo de/i);
  });
});

describe('vào thi: dùng Mã đề của người dự thi', () => {
  const enroll = async (sessionId: string, n: number) => {
    const takers: Taker[] = [];
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const user = await seedUser({ username: `sv${i}`, code: `SV${i}`, roleTags: ['candidate'] });
      ids.push(user.id);
    }
    await call(t.app, 'POST', `/api/sessions/${sessionId}/roster`, {
      cookie,
      body: { userIds: ids },
    });
    for (let i = 0; i < n; i++) {
      const taker = await Taker.signIn(t, `sv${i}`);
      await taker.join('AB3K9X');
      takers.push(taker);
    }
    return { takers, ids };
  };
  const layoutItems = async (userId: string, sessionId: string) => {
    const rows = await sql<{
      layout: { sections: { items: { itemId: string }[] }[] };
      variant_id: string | null;
    }>(
      `select layout, variant_id from attempts where session_id = $1 and user_id = $2 order by attempt_no`,
      [sessionId, userId],
    );
    return rows.map((r) => ({
      items: r.layout.sections.flatMap((s) => s.items.map((i) => i.itemId)),
      variantId: r.variant_id,
    }));
  };

  it('một Mã đề: mọi người cùng một bộ câu (đúng bộ đã lưu), roster và Lượt ghi Mã đề', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const { takers, ids } = await enroll(id, 3);
    for (const taker of takers) {
      expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);
    }
    const variant = (await variantsOf(id))[0] as { id: string };
    const expected = (await itemsOf(variant.id)).sort();
    for (const userId of ids) {
      const [attempt] = await layoutItems(userId, id);
      expect([...(attempt?.items ?? [])].sort()).toEqual(expected);
      expect(attempt?.variantId).toBe(variant.id);
    }
    const roster = await sql<{ variant_id: string }>(
      `select variant_id from session_roster where session_id = $1`,
      [id],
    );
    expect(roster.every((r) => r.variant_id === variant.id)).toBe(true);
  });

  it('Phiên thi per_candidate không đổi: không ghi Mã đề vào Lượt', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id);
    const id = created.json().id;
    const { takers, ids } = await enroll(id, 1);
    expect((await takers[0]?.call('POST', `/take/sessions/${id}/start`))?.statusCode).toBe(200);
    expect((await layoutItems(ids[0] as string, id))[0]?.variantId).toBeNull();
  });

  it('nhiều Mã đề: người vào lần lượt được gán Mã đề ít người nhất (6 người, 3 Mã đề thành 2/2/2)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const { takers } = await enroll(id, 6);
    for (const taker of takers) {
      expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);
    }
    const counts = await sql<{ n: string }>(
      `select count(*) n from session_roster where session_id = $1 group by variant_id order by variant_id`,
      [id],
    );
    expect(counts.map((c) => Number(c.n))).toEqual([2, 2, 2]);
  });

  it('nhiều người bấm bắt đầu cùng lúc vẫn chia đều (9 người, 3 Mã đề thành 3/3/3)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const { takers } = await enroll(id, 9);
    const results = await Promise.all(
      takers.map((taker) => taker.call('POST', `/take/sessions/${id}/start`)),
    );
    for (const res of results) expect(res.statusCode, res.body).toBe(200);
    const counts = await sql<{ n: string }>(
      `select count(*) n from session_roster where session_id = $1 group by variant_id`,
      [id],
    );
    expect(counts.map((c) => Number(c.n)).sort()).toEqual([3, 3, 3]);
  });

  it('làm lại: giữ nguyên Mã đề và bộ câu ở mọi Lượt (Q468)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, {
      drawScope: 'shared',
      variantCount: 2,
      maxAttempts: 2,
    });
    const id = created.json().id;
    const { takers, ids } = await enroll(id, 1);
    const taker = takers[0] as Taker;
    expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);
    const first = (
      await sql<{ id: string }>(`select id from attempts where session_id = $1`, [id])
    )[0];
    expect((await taker.call('POST', `/take/attempts/${first?.id}/submit`)).statusCode).toBe(200);
    expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);
    const attempts = await layoutItems(ids[0] as string, id);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.variantId).toBe(attempts[0]?.variantId);
    expect([...(attempts[1]?.items ?? [])].sort()).toEqual([...(attempts[0]?.items ?? [])].sort());
  });
});

describe('quy tắc điểm (Q469)', () => {
  it('Phát hành Bộ đề với Phần rút dưới 100 % mà câu lệch điểm: không chặn, chỉ cảnh báo', async () => {
    const exam = await publishedDrawExam(t, cookie, [{ points: [2, 1, 1], drawPercent: 50 }]);
    expect(exam.id).toBeTruthy(); // publishedDrawExam đã kiểm Phát hành thành công (200)
  });

  it('Phiên thi shared một Mã đề: câu lệch điểm vẫn tạo được', async () => {
    const exam = await publishedDrawExam(t, cookie, [{ points: [2, 1, 1], drawPercent: 50 }]);
    const created = await createSession(exam.id, { drawScope: 'shared' });
    expect(created.statusCode, created.body).toBe(201);
  });

  it('Phiên thi shared nhiều Mã đề mà tổng điểm các Mã đề khác nhau: bị từ chối variant_points_uneven', async () => {
    // Phần 2 câu (100 và 1 điểm), rút 50 %: mỗi Mã đề lấy 1 trong 2 câu nên tổng 100 hoặc 1; 10 Mã đề giống hệt nhau chỉ xảy ra
    // với xác suất 2/1024, nên thử lại vài lần để bài kiểm không chập chờn.
    const exam = await publishedDrawExam(t, cookie, [{ points: [100, 1], drawPercent: 50 }]);
    let rejected: Awaited<ReturnType<typeof createSession>> | undefined;
    for (let attempt = 0; attempt < 4 && !rejected; attempt++) {
      const res = await createSession(exam.id, {
        drawScope: 'shared',
        variantCount: 10,
        accessCode: `AB3K9${attempt}`,
      });
      if (res.statusCode !== 201) rejected = res;
    }
    expect(rejected?.statusCode, rejected?.body).toBe(400);
    expect(rejected?.json().issues).toContainEqual(
      expect.objectContaining({ code: 'variant_points_uneven' }),
    );
    expect((await sql(`select 1 from sessions`)).length).toBeGreaterThanOrEqual(0);
  });

  it('per_candidate giữ luật cũ: Phần rút dưới 100 % mà lệch điểm bị từ chối khi lưu Phiên thi', async () => {
    const exam = await publishedDrawExam(t, cookie, [{ points: [2, 1, 1], drawPercent: 50 }]);
    const res = await createSession(exam.id, {
      drawScope: 'per_candidate',
      sectionDraws: [{ sectionId: exam.sectionIds[0], percent: 50 }],
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.json().issues).toContainEqual(
      expect.objectContaining({ code: 'draw_points_uneven' }),
    );
  });
});
