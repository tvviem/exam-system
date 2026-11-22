import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readDocx } from '../src/modules/paper/docx-reader.test-support';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// V2a của "Mã đề của Phiên thi" (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6, Q478, Q479): gán Mã đề cho Danh sách dự thi khi lưu,
// xem bộ câu từng Mã đề, Rút lại, Xem thử và xuất Word theo Mã đề. Chạy trên PostgreSQL thật qua API.

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
const updateSession = (
  examId: string,
  detail: { id: string; version: number },
  extra: Record<string, unknown>,
) =>
  call(t.app, 'PUT', `/api/sessions/${detail.id}`, {
    cookie,
    body: { ...settings(examId), version: detail.version, ...extra },
  });

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

describe('gán Mã đề cho Danh sách dự thi (Q479)', () => {
  it('thêm người vào Phiên thi 3 Mã đề: mọi người có Mã đề ngay, số người các Mã đề lệch tối đa 1', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    await addToRoster(id, 7);
    const map = await assignment(id);
    expect([...map.values()].every((n) => n !== null)).toBe(true);
    const c = loads(map, 3);
    expect(c.reduce((a, b) => a + b, 0)).toBe(7);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });

  it('thêm người sau: người mới nhận Mã đề đang ít người nhất, người cũ giữ nguyên', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    await addToRoster(id, 6);
    const before = await assignment(id);
    expect(loads(before, 3)).toEqual([2, 2, 2]);
    await addToRoster(id, 2);
    const after = await assignment(id);
    for (const [user, n] of before) expect(after.get(user)).toBe(n);
    const c = loads(after, 3);
    expect(c.reduce((a, b) => a + b, 0)).toBe(8);
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });

  it('đổi số Mã đề thì chia lại cả Danh sách (1 thành 3, rồi 3 thành 2)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    await addToRoster(id, 6);
    const to3 = await updateSession(exam.id, created.json(), {
      drawScope: 'shared',
      variantCount: 3,
    });
    expect(to3.statusCode, to3.body).toBe(200);
    expect(loads(await assignment(id), 3)).toEqual([2, 2, 2]);
    const to2 = await updateSession(exam.id, to3.json(), {
      drawScope: 'shared',
      variantCount: 2,
    });
    expect(to2.statusCode, to2.body).toBe(200);
    const map = await assignment(id);
    expect([...map.values()].every((n) => n === 1 || n === 2)).toBe(true);
    expect(loads(map, 2)).toEqual([3, 3]);
  });

  it('sửa việc khác của Phiên thi (tên) không xáo lại cách đã chia', async () => {
    t.clock.set(new Date('2026-11-02T06:00:00+07:00')); // trước giờ mở: còn sửa được tên
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    await addToRoster(id, 9);
    const before = await assignment(id);
    const renamed = await updateSession(exam.id, created.json(), {
      drawScope: 'shared',
      variantCount: 3,
      title: 'Ca 1 (đổi tên)',
    });
    expect(renamed.statusCode, renamed.body).toBe(200);
    expect([...(await assignment(id))]).toEqual([...before]);
  });
});

describe('xem bộ câu của từng Mã đề', () => {
  it('trả từng Mã đề với câu theo Phần: số câu, tổng điểm; mỗi câu chỉ có mã, loại, điểm, đề bài (không có đáp án)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const res = await call(t.app, 'GET', `/api/sessions/${id}/variants`, { cookie });
    expect(res.statusCode, res.body).toBe(200);
    const { variants } = res.json();
    expect(variants.map((v: { number: number; label: string }) => [v.number, v.label])).toEqual([
      [1, 'Đề 1'],
      [2, 'Đề 2'],
    ]);
    for (const variant of variants) {
      expect(variant).toMatchObject({ itemCount: 4, totalPoints: 4 });
      expect(variant.sections).toHaveLength(2);
      expect(variant.sections[0].items).toHaveLength(2); // 40 % của 5 câu
      expect(variant.sections[1].items).toHaveLength(2);
      const all = variant.sections.flatMap((s: { items: unknown[] }) => s.items);
      for (const item of all as Record<string, unknown>[]) {
        expect(Object.keys(item).sort()).toEqual(['itemId', 'points', 'stem', 'type']);
      }
    }
    // Câu của Phần 1 thuộc Phần 1 của Bộ đề.
    const first = variants[0].sections[0].items.map((i: { itemId: string }) => i.itemId);
    for (const itemId of first) expect(exam.itemIds.slice(0, 5)).toContain(itemId);
  });

  it('Phiên thi mỗi người một đề thì không có Mã đề (danh sách rỗng)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id);
    const res = await call(t.app, 'GET', `/api/sessions/${created.json().id}/variants`, {
      cookie,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ variants: [] });
  });

  it('người ra đề khác nhận 404 (không lộ Phiên thi có tồn tại)', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    await seedUser({ username: 'gv2', roleTags: ['examiner'] });
    const other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
    const res = await call(t.app, 'GET', `/api/sessions/${created.json().id}/variants`, {
      cookie: other,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Rút lại bộ câu của Mã đề', () => {
  /** Bộ đề một Phần 20 câu rút 50 %: hai lần rút trùng nhau gần như không xảy ra. */
  const bigExam = () =>
    publishedDrawExam(t, cookie, [{ points: Array(20).fill(1), drawPercent: 50 }]);
  const seedsAndItems = async (sessionId: string) => {
    const rows = await sql<{ number: number; draw_seed: string; items: string[] }>(
      `select v.number, v.draw_seed::text, array_agg(i.item_id::text order by i.item_id::text) items
         from session_variants v join session_variant_items i on i.variant_id = v.id
        where v.session_id = $1 group by v.id order by v.number`,
      [sessionId],
    );
    return rows;
  };
  const redraw = (id: string, body: Record<string, unknown> = {}, who = cookie) =>
    call(t.app, 'POST', `/api/sessions/${id}/variants/redraw`, { cookie: who, body });

  it('Rút lại tất cả: mọi Mã đề đổi hạt giống và bộ câu, vẫn đủ số câu; Danh sách giữ nguyên Mã đề', async () => {
    const exam = await bigExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    await addToRoster(id, 6);
    const before = await seedsAndItems(id);
    const assigned = await assignment(id);
    const res = await redraw(id);
    expect(res.statusCode, res.body).toBe(200);
    const after = await seedsAndItems(id);
    for (const [i, row] of after.entries()) {
      expect(row.draw_seed).not.toBe(before[i]?.draw_seed);
      expect(row.items).toHaveLength(10);
      expect(row.items).not.toEqual(before[i]?.items);
    }
    expect([...(await assignment(id))]).toEqual([...assigned]);
  });

  it('Rút lại một Mã đề: chỉ Mã đề đó đổi', async () => {
    const exam = await bigExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    const before = await seedsAndItems(id);
    const res = await redraw(id, { number: 2 });
    expect(res.statusCode, res.body).toBe(200);
    const after = await seedsAndItems(id);
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1]?.draw_seed).not.toBe(before[1]?.draw_seed);
    expect(after[1]?.items).not.toEqual(before[1]?.items);
  });

  it('Mã đề không có thì 404; Phiên thi mỗi người một đề thì 409 NOT_SHARED', async () => {
    const exam = await bigExam();
    const shared = await createSession(exam.id, { drawScope: 'shared' });
    expect((await redraw(shared.json().id, { number: 5 })).statusCode).toBe(404);
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    const res = await redraw(per.json().id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_SHARED' });
  });

  it('người ra đề khác nhận 404 và không đổi gì', async () => {
    const exam = await bigExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const before = await seedsAndItems(id);
    await seedUser({ username: 'gv2', roleTags: ['examiner'] });
    const other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
    expect((await redraw(id, {}, other)).statusCode).toBe(404);
    expect(await seedsAndItems(id)).toEqual(before);
  });

  it('đã có Lượt làm bài thì 409 HAS_ATTEMPTS và bộ câu không đổi', async () => {
    const exam = await bigExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const [userId] = await addToRoster(id, 1);
    const taker = await Taker.signIn(t, `sv0`);
    await taker.join('AB3K9X');
    expect((await taker.call('POST', `/take/sessions/${id}/start`)).statusCode).toBe(200);
    expect(userId).toBeTruthy();
    const before = await seedsAndItems(id);
    const res = await redraw(id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'HAS_ATTEMPTS' });
    expect(await seedsAndItems(id)).toEqual(before);
  });
});

describe('Xem thử theo Mã đề', () => {
  interface Preview {
    draw: { count: number; total: number } | null;
    sections: { items: { itemId: string }[] }[];
  }
  const tryVariant = (id: string, query = '', who = cookie) =>
    call(t.app, 'GET', `/api/sessions/${id}/try${query}`, { cookie: who });
  const itemsIn = (view: Preview) => view.sections.flatMap((s) => s.items.map((i) => i.itemId));
  const variantItems = async (sessionId: string, number: number) =>
    (
      await sql<{ item_id: string }>(
        `select i.item_id from session_variant_items i join session_variants v on v.id = i.variant_id
          where v.session_id = $1 and v.number = $2`,
        [sessionId, number],
      )
    ).map((r) => r.item_id);

  it('chọn Mã đề: thấy đúng bộ câu của Mã đề đó, kèm draw; mỗi lần mở vẫn cùng bộ câu', async () => {
    const exam = await publishedDrawExam(t, cookie, [
      { points: Array(20).fill(1), drawPercent: 50 },
    ]);
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 3 });
    const id = created.json().id;
    for (const number of [1, 2, 3]) {
      const expected = (await variantItems(id, number)).sort();
      for (let again = 0; again < 2; again++) {
        const res = await tryVariant(id, `?variant=${number}`);
        expect(res.statusCode, res.body).toBe(200);
        const view = res.json() as Preview;
        expect(itemsIn(view).sort()).toEqual(expected);
        expect(view.draw).toEqual({ count: 10, total: 20 });
      }
    }
  });

  it('không nêu variant thì xem Mã đề đầu; Mã đề không có thì 404', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    const view = (await tryVariant(id)).json() as Preview;
    expect(itemsIn(view).sort()).toEqual((await variantItems(id, 1)).sort());
    expect((await tryVariant(id, '?variant=3')).statusCode).toBe(404);
    expect((await tryVariant(id, '?variant=abc')).statusCode).toBe(400);
  });

  it('Phiên thi mỗi người một đề: variant không có nghĩa (404), xem thử rút mẫu như trước', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id);
    const id = created.json().id;
    expect((await tryVariant(id)).statusCode).toBe(200);
    expect((await tryVariant(id, '?variant=1')).statusCode).toBe(404);
  });
});

describe('xuất Word theo Mã đề', () => {
  const exportDoc = (kind: 'exam' | 'answers', body: Record<string, unknown>, who = cookie) =>
    call(t.app, 'POST', `/api/paper/${kind}`, {
      cookie: who,
      body: { course: 'Tin học', ...(kind === 'answers' ? { confirm: true } : {}), ...body },
    });
  const paragraphsOf = async (res: { rawPayload: Buffer }) =>
    (await (await readDocx(new Uint8Array(res.rawPayload))).part('word/document.xml')).paragraphs();
  const variantItemIds = async (sessionId: string, number: number) =>
    (
      await sql<{ item_id: string }>(
        `select i.item_id from session_variant_items i join session_variants v on v.id = i.variant_id
          where v.session_id = $1 and v.number = $2`,
        [sessionId, number],
      )
    ).map((r) => r.item_id);
  /** Đề bài "Câu K" của tệp Đề, đúng thứ tự xuất hiện (K là số thứ tự trong Bộ đề gốc). */
  const stemsOf = (paragraphs: string[]) =>
    paragraphs.flatMap((p) => {
      const m = /^Câu \d+: Câu (\d+)$/.exec(p);
      return m ? [Number(m[1])] : [];
    });

  it('tệp Đề: chỉ gồm câu của Mã đề được chọn, ô Mã đề điền sẵn nhãn của Mã đề', async () => {
    const exam = await publishedDrawExam(t, cookie, [
      { points: [1, 1, 1, 1, 1, 1, 1, 1], drawPercent: 50 },
    ]);
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    for (const number of [1, 2]) {
      const res = await exportDoc('exam', { sessionId: id, variant: number });
      expect(res.statusCode, res.body).toBe(200);
      const paragraphs = await paragraphsOf(res);
      const expected = (await variantItemIds(id, number))
        .map((itemId) => exam.itemIds.indexOf(itemId) + 1)
        .sort((a, b) => a - b);
      expect(expected).toHaveLength(4);
      expect(stemsOf(paragraphs)).toEqual(expected);
      expect(paragraphs).toContain(`Lớp: ........  Mã đề: Đề ${number}`);
      expect(paragraphs).toContain('PHẦN BÀI LÀM 4 CÂU TRẮC NGHIỆM');
    }
  });

  it('Mã đề nhập tay (examCode) thắng nhãn của Mã đề', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const res = await exportDoc('exam', {
      sessionId: created.json().id,
      variant: 2,
      examCode: 'A02',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await paragraphsOf(res)).toContain('Lớp: ........  Mã đề: A02');
  });

  it('tệp Đáp án: chỉ các câu của Mã đề, điểm và tổng điểm theo Mã đề', async () => {
    const exam = await publishedDrawExam(t, cookie, [
      { points: [1, 2, 3, 4, 5, 6], drawPercent: 50 },
    ]);
    const created = await createSession(exam.id, { drawScope: 'shared' });
    const id = created.json().id;
    const res = await exportDoc('answers', { sessionId: id, variant: 1 });
    expect(res.statusCode, res.body).toBe(200);
    const paragraphs = await paragraphsOf(res);
    const points = (await variantItemIds(id, 1))
      .map((itemId) => exam.itemIds.indexOf(itemId) + 1)
      .sort((a, b) => a - b); // điểm của câu thứ k là k
    expect(points).toHaveLength(3);
    const total = points.reduce((a, b) => a + b, 0);
    expect(paragraphs).toContain(`Tổng điểm: ${total}`);
    // Mỗi dòng đáp án là bốn ô liền nhau: số câu, đáp án, điểm, cách chấm; điểm khớp câu đã chọn.
    const at = paragraphs.indexOf('Cách chấm') + 1;
    const rows = [0, 1, 2].map((r) => paragraphs.slice(at + r * 4, at + r * 4 + 4));
    expect(rows.map((r) => r[0])).toEqual(['1', '2', '3']);
    expect(rows.map((r) => Number(r[2]))).toEqual(points);
  });

  it('Phiên thi một Mã đề: không nêu variant thì xuất Mã đề duy nhất; nhiều Mã đề mà không nêu thì 400', async () => {
    const exam = await drawExam();
    const one = await createSession(exam.id, { drawScope: 'shared' });
    const ok = await exportDoc('exam', { sessionId: one.json().id });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(await paragraphsOf(ok)).toContain('Lớp: ........  Mã đề: Đề 1');
    const two = await createSession(exam.id, {
      drawScope: 'shared',
      variantCount: 2,
      accessCode: 'ZZ3K9X',
    });
    const bad = await exportDoc('exam', { sessionId: two.json().id });
    expect(bad.statusCode, bad.body).toBe(400);
    expect(bad.json()).toMatchObject({ issues: [{ path: 'variant', code: 'required' }] });
  });

  it('Mã đề không có: 404; Phiên thi mỗi người một đề mà nêu variant: 409; variant khi xuất từ Bộ đề: 400', async () => {
    const exam = await drawExam();
    const shared = await createSession(exam.id, { drawScope: 'shared' });
    expect((await exportDoc('exam', { sessionId: shared.json().id, variant: 3 })).statusCode).toBe(
      404,
    );
    const per = await createSession(exam.id, { accessCode: 'ZZ3K9X' });
    const refused = await exportDoc('exam', { sessionId: per.json().id, variant: 1 });
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'NOT_SHARED' });
    expect((await exportDoc('exam', { examId: exam.id, variant: 1 })).statusCode).toBe(400);
  });

  it('nhật ký ghi Mã đề đã xuất', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared', variantCount: 2 });
    const id = created.json().id;
    expect((await exportDoc('exam', { sessionId: id, variant: 2 })).statusCode).toBe(200);
    const [row] = await sql<{ after: Record<string, unknown> }>(
      `select after from audit_logs where action = 'paper.export'`,
    );
    expect(row?.after).toEqual({ kind: 'exam', sessionId: id, variant: 2, warnings: 0 });
  });

  it('người ra đề khác nhận 404', async () => {
    const exam = await drawExam();
    const created = await createSession(exam.id, { drawScope: 'shared' });
    await seedUser({ username: 'gv2', roleTags: ['examiner'] });
    const other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
    for (const kind of ['exam', 'answers'] as const) {
      const res = await exportDoc(kind, { sessionId: created.json().id, variant: 1 }, other);
      expect(res.statusCode).toBe(404);
    }
  });

  it('Phiên thi mỗi người một đề không nêu variant: xuất cả Bộ đề như trước (không đổi hành vi)', async () => {
    const exam = await drawExam();
    const per = await createSession(exam.id);
    const res = await exportDoc('exam', { sessionId: per.json().id });
    expect(res.statusCode, res.body).toBe(200);
    expect(stemsOf(await paragraphsOf(res))).toHaveLength(7); // 5 + 2: đủ mọi câu của Bộ đề
  });
});
