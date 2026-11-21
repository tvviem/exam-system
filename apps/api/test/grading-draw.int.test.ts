import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { type DrawExamRef, type DrawSectionSpec, publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// R3 (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.5): chấm điểm, điểm tối đa, Phúc khảo, theo dõi và xuất Excel theo ĐÚNG bộ câu
// của từng Lượt. Bộ đề: Phần A 10 câu × 1 điểm rút 40 % (mỗi người 4 câu), Phần B 5 câu × 2 điểm lấy đủ: mỗi người 9 câu, tối đa 14 điểm.

let t: TestApp;
let cookie: string;
let exam: DrawExamRef;
let sessionId: string;
const names = ['an', 'binh', 'chi'];

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie, body });

async function setup(
  sections: DrawSectionSpec[],
  sessionExtra: (built: DrawExamRef) => Record<string, unknown> = () => ({}),
) {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  const ids: string[] = [];
  for (const [i, username] of names.entries()) {
    ids.push((await seedUser({ username, code: `SV00${i + 1}`, roleTags: ['candidate'] })).id);
  }
  cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  exam = await publishedDrawExam(t, cookie, sections);
  const created = await api('POST', '/sessions', {
    examId: exam.id,
    title: 'Giữa kỳ rút câu',
    opensAt: '2026-11-02T07:00:00+07:00',
    closesAt: '2026-11-02T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'RC3X9K',
    ...sessionExtra(exam),
  });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
  await api('POST', `/sessions/${sessionId}/roster`, { userIds: ids });
}

async function start(name: string) {
  const taker = await Taker.signIn(t, name);
  await taker.join('RC3X9K');
  const res = await taker.call('POST', `/take/sessions/${sessionId}/start`);
  expect(res.statusCode, res.body).toBe(200);
  return { taker, view: res.json(), attemptId: res.json().attempt.id as string };
}

/** Trả lời mọi câu hiện ra: `right` đúng ('o2'), còn lại sai ('o1'). */
async function answerAll(
  who: Awaited<ReturnType<typeof start>>,
  right: (sectionIndex: number) => boolean,
) {
  const items = who.view.sections.flatMap(
    (section: { items: { itemId: string }[] }, sectionIndex: number) =>
      section.items.map((item) => ({
        itemId: item.itemId,
        clientSeq: 1,
        value: { optionId: right(sectionIndex) ? 'o2' : 'o1' },
      })),
  );
  const saved = await who.taker.call('PUT', `/take/attempts/${who.attemptId}/responses`, { items });
  expect(saved.statusCode, saved.body).toBe(200);
}
const submit = async (who: Awaited<ReturnType<typeof start>>) => {
  await who.taker.call('POST', `/take/attempts/${who.attemptId}/submit`);
};

/** Quá Khung giờ (đóng 10:00) để Công bố được. */
const finish = () => t.clock.set(new Date('2026-11-02T10:30:00+07:00'));

const gradedItems = async (attemptId: string) =>
  (
    await sql<{ item_id: string }>(`select item_id from response_grades where attempt_id = $1`, [
      attemptId,
    ])
  ).map((row) => row.item_id);
const layoutItems = async (attemptId: string) =>
  (
    (
      await sql<{ layout: { sections: { items: { itemId: string }[] }[] } }>(
        `select layout from attempts where id = $1`,
        [attemptId],
      )
    )[0]?.layout.sections ?? []
  ).flatMap((section) => section.items.map((item) => item.itemId));

describe('Phiên thi rút câu: chấm và Kết quả theo bộ câu của từng Lượt', () => {
  let people: Record<string, Awaited<ReturnType<typeof start>>>;
  beforeEach(async () => {
    await setup([{ drawPercent: 40, points: Array(10).fill(1) }, { points: Array(5).fill(2) }]);
    people = {};
    for (const name of names) people[name] = await start(name);
    await answerAll(people.an as never, () => true); // đúng hết: 4 + 10 = 14
    await answerAll(people.binh as never, (section) => section === 1); // sai Phần A, đúng Phần B: 10
    // chi nộp bài trắng
    for (const name of names) await submit(people[name] as never);
    await t.queue.drain();
  });

  it('chấm tự động chỉ tạo điểm cho các câu của Lượt (9 câu), không cho câu chưa từng hiện', async () => {
    for (const name of names) {
      const attemptId = (people[name] as { attemptId: string }).attemptId;
      expect((await gradedItems(attemptId)).sort()).toEqual((await layoutItems(attemptId)).sort());
      expect(await gradedItems(attemptId)).toHaveLength(9);
    }
  });

  it('bảng Kết quả: mỗi người 9 câu, điểm tối đa 14; điểm và thang 10 tính theo 14 (không theo 20 của cả Bộ đề)', async () => {
    const res = (await api('GET', `/sessions/${sessionId}/results`)).json();
    expect(res.session).toMatchObject({ totalItems: 9, maxScore: 14 });
    const byCode = Object.fromEntries(
      res.people.map((p: { code: string }) => [p.code, p]),
    ) as Record<string, { rawScore: number; scaledScore: number; maxScore: number }>;
    expect(byCode.SV001).toMatchObject({ rawScore: 14, scaledScore: 10, maxScore: 14 });
    expect(byCode.SV002).toMatchObject({ rawScore: 10, maxScore: 14 });
    expect(byCode.SV002?.scaledScore).toBeCloseTo(7.14, 1);
    expect(byCode.SV003).toMatchObject({ rawScore: 0, scaledScore: 0 });
  });

  it('chi tiết một người chỉ liệt kê 9 câu của Lượt, đúng các câu đã rút', async () => {
    const userId = (await sql<{ id: string }>(`select id from users where username = 'an'`))[0]?.id;
    const detail = (await api('GET', `/sessions/${sessionId}/results/people/${userId}`)).json();
    const items = detail.attempts[0].items as { itemId: string }[];
    expect(items.map((i) => i.itemId).sort()).toEqual(
      (await layoutItems((people.an as { attemptId: string }).attemptId)).sort(),
    );
  });

  it('Kết quả của Người dự thi sau Công bố: điểm tối đa 14 và chỉ 9 câu của chính họ', async () => {
    await api('GET', `/sessions/${sessionId}/results`); // chấm bù, nạp bài
    finish();
    const released = await api('POST', `/sessions/${sessionId}/release`, { appealPeriodDays: 3 });
    expect(released.statusCode, released.body).toBe(200);
    const mine = await (people.an as { taker: Taker }).taker.call(
      'GET',
      `/take/sessions/${sessionId}/result`,
    );
    expect(mine.statusCode, mine.body).toBe(200);
    const body = mine.json();
    expect(body.summary).toMatchObject({
      rawScore: 14,
      maxScore: 14,
      finalScore: 14,
      percent: 100,
    });
    expect(body.items).toHaveLength(9);
    expect(
      body.items.map((i: { no: number }) => i.no).sort((a: number, b: number) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const binh = await (people.binh as { taker: Taker }).taker.call(
      'GET',
      `/take/sessions/${sessionId}/result`,
    );
    expect(binh.json().summary).toMatchObject({ rawScore: 10, maxScore: 14 });
    expect(binh.json().items).toHaveLength(9);
  });

  it('xuất Excel: Tổng số câu 9, Tổng điểm 14; trang Chi tiết để trống các câu không được rút', async () => {
    await api('GET', `/sessions/${sessionId}/results`);
    const res = await call(t.app, 'GET', `/api/sessions/${sessionId}/results.xlsx`, { cookie });
    expect(res.statusCode).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const summary = workbook.getWorksheet('Tổng hợp') ?? workbook.worksheets[0];
    const cells = (summary?.getSheetValues() ?? []).flat().map(String);
    expect(cells.some((c) => c.includes('9 câu'))).toBe(true);
    expect(cells).toContain('14');
    const detail = workbook.getWorksheet('Chi tiết');
    const row = detail?.getRow(2).values as unknown[];
    const scores = row.slice(3);
    expect(scores).toHaveLength(15);
    expect(scores.filter((v) => v !== '' && v !== undefined && v !== null)).toHaveLength(9);
  });
});

describe('Phúc khảo và theo dõi theo số câu của Lượt', () => {
  it('hạn mức Phúc khảo theo số câu của Lượt: Bộ đề 100 câu rút 40 % (40 câu) được 4 lượt, không phải 10', async () => {
    await setup(Array.from({ length: 5 }, () => ({ drawPercent: 40, points: Array(20).fill(1) })));
    const an = await start('an');
    expect(an.view.sections.flatMap((s: { items: unknown[] }) => s.items)).toHaveLength(40);
    await answerAll(an, () => true);
    await submit(an);
    await t.queue.drain();
    await api('GET', `/sessions/${sessionId}/results`);
    finish();
    expect(
      (await api('POST', `/sessions/${sessionId}/release`, { appealPeriodDays: 3 })).statusCode,
    ).toBe(200);
    const mine = await an.taker.call('GET', `/take/sessions/${sessionId}/appeals`);
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().limit).toBe(4);
    // Hạn mức được áp khi gửi Phúc khảo: 4 câu đầu được nhận, câu thứ năm bị từ chối.
    for (const no of [1, 2, 3, 4]) {
      const sent = await an.taker.call('POST', `/take/sessions/${sessionId}/appeals`, {
        target: 'response',
        no,
        reason: 'Tôi cho rằng câu này chấm chưa đúng, xin xem lại giúp.',
      });
      expect(sent.statusCode, sent.body).toBe(201);
    }
    const over = await an.taker.call('POST', `/take/sessions/${sessionId}/appeals`, {
      target: 'response',
      no: 5,
      reason: 'Tôi cho rằng câu này chấm chưa đúng, xin xem lại giúp.',
    });
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json()).toMatchObject({ reason: 'APPEAL_LIMIT_REACHED', limit: 4 });
  });

  it('theo dõi Phiên thi: tổng số câu là số câu mỗi người nhận (9), không phải 15 của Bộ đề', async () => {
    await setup([{ drawPercent: 40, points: Array(10).fill(1) }, { points: Array(5).fill(2) }]);
    await start('an');
    const monitor = await api('GET', `/sessions/${sessionId}/monitor`);
    expect(monitor.statusCode, monitor.body).toBe(200);
    expect(monitor.json().totalItems).toBe(9);
  });
});

describe('tương thích: Phiên thi không rút câu chấm và tính điểm như trước', () => {
  it('Bộ đề 5 câu đủ: tối đa 10 điểm, mọi người 5 câu', async () => {
    await setup([{ points: Array(5).fill(2) }]);
    const an = await start('an');
    await answerAll(an, () => true);
    await submit(an);
    await t.queue.drain();
    const res = (await api('GET', `/sessions/${sessionId}/results`)).json();
    expect(res.session).toMatchObject({ totalItems: 5, maxScore: 10 });
    expect(res.people.find((p: { code: string }) => p.code === 'SV001')).toMatchObject({
      rawScore: 10,
      scaledScore: 10,
    });
  });
});

describe('tự luận chấm tay trong Phiên thi rút câu', () => {
  it('mỗi Lượt chỉ có các bài tự luận đã rút: tiến độ chấm, hàng đợi từng câu và chặn chấm câu chưa rút', async () => {
    // Phần A: 6 câu tự luận × 2 điểm, rút 50 % (3 câu mỗi người); Phần B: 2 câu chọn một.
    await setup([{ kind: 'essay', drawPercent: 50, points: Array(6).fill(2) }, { points: [1, 1] }]);
    const people = [];
    for (const name of names) people.push(await start(name));
    for (const who of people) {
      const essays = who.view.sections[0].items as { itemId: string }[];
      expect(essays).toHaveLength(3);
      await who.taker.call('PUT', `/take/attempts/${who.attemptId}/responses`, {
        items: essays.map((e) => ({ itemId: e.itemId, clientSeq: 1, value: { text: 'bài làm' } })),
      });
      await submit(who);
    }
    await t.queue.drain();

    const items = (await api('GET', `/sessions/${sessionId}/grading/items`)).json().items as {
      itemId: string;
      total: number;
      pending: number;
    }[];
    expect(items).toHaveLength(6);
    // 3 người × 3 câu = 9 bài tự luận cần chấm (không phải 3 × 6 = 18); mỗi câu chỉ có người đã rút nó.
    expect(items.reduce((sum, item) => sum + item.total, 0)).toBe(9);
    expect(items.reduce((sum, item) => sum + item.pending, 0)).toBe(9);
    const results = (await api('GET', `/sessions/${sessionId}/results`)).json();
    expect(results.status.pendingEssays).toBe(9);

    // Chấm câu không nằm trong bố cục của Lượt: 404, không tạo điểm cho câu chưa từng hiện.
    const first = people[0] as (typeof people)[number];
    const laid = new Set(await layoutItems(first.attemptId));
    const notDrawn = exam.itemIds.slice(0, 6).find((id) => !laid.has(id)) as string;
    const refused = await api(
      'PUT',
      `/sessions/${sessionId}/grading/attempts/${first.attemptId}/items/${notDrawn}`,
      { score: 1 },
    );
    expect(refused.statusCode, refused.body).toBe(404);
    expect(await gradedItems(first.attemptId)).not.toContain(notDrawn);

    // Chấm một câu đã rút thì được.
    const drawnItem = [...laid][0] as string;
    const ok = await api(
      'PUT',
      `/sessions/${sessionId}/grading/attempts/${first.attemptId}/items/${drawnItem}`,
      { score: 1.5 },
    );
    expect(ok.statusCode, ok.body).toBe(200);
  });
});

describe('Đính chính đáp án trong Phiên thi rút câu', () => {
  it('chấm lại chỉ các Lượt đã rút câu đó, không tạo điểm cho Lượt chưa từng thấy câu', async () => {
    await setup([{ drawPercent: 40, points: Array(10).fill(1) }, { points: Array(5).fill(2) }]);
    const people = [];
    for (const name of names) people.push(await start(name));
    for (const who of people) {
      await answerAll(who, () => true); // mọi câu đã rút đều chọn o2 (đúng)
      await submit(who);
    }
    await t.queue.drain();
    await api('GET', `/sessions/${sessionId}/results`);

    // Một câu của Phần A mà ít nhất một người rút và ít nhất một người không rút.
    const laid = await Promise.all(people.map((who) => layoutItems(who.attemptId)));
    const sectionA = exam.itemIds.slice(0, 10);
    const target = sectionA.find(
      (id) => laid.some((set) => set.includes(id)) && laid.some((set) => !set.includes(id)),
    ) as string;
    expect(target).toBeTruthy();
    const drewIt = people.filter((_, i) => (laid[i] as string[]).includes(target));

    const before = Number((await sql(`select count(*)::int n from response_grades`))[0]?.n);
    const sent = await api('POST', `/exams/${exam.id}/items/${target}/key-correction`, {
      newKey: ['o1'],
      reason: 'Nhập nhầm đáp án',
    });
    expect(sent.statusCode, sent.body).toBe(202);
    await t.queue.drain();

    // Số dòng điểm không đổi (không tạo điểm cho Lượt chưa rút); chỉ Lượt đã rút câu này đổi từ 1 xuống 0.
    expect(Number((await sql(`select count(*)::int n from response_grades`))[0]?.n)).toBe(before);
    const rows = await sql<{ attempt_id: string; score: string }>(
      `select attempt_id, score from response_grades where item_id = $1`,
      [target],
    );
    expect(rows.map((r) => r.attempt_id).sort()).toEqual(drewIt.map((w) => w.attemptId).sort());
    expect(rows.every((r) => Number(r.score) === 0)).toBe(true);
  });
});

describe('ghi đè ở Phiên thi đổi số câu và điểm tối đa', () => {
  it('Phần A không đặt mặc định, Phiên thi ghi đè 50 %: mỗi người 5 + 5 = 10 câu, tối đa 15 điểm; danh sách của Người dự thi cũng báo 10 câu', async () => {
    await setup([{ points: Array(10).fill(1) }, { points: Array(5).fill(2) }], (built) => ({
      sectionDraws: [{ sectionId: built.sectionIds[0], percent: 50 }],
    }));
    const an = await start('an');
    expect(an.view.sections.flatMap((s: { items: unknown[] }) => s.items)).toHaveLength(10);
    await answerAll(an, () => true);
    await submit(an);
    await t.queue.drain();
    const res = (await api('GET', `/sessions/${sessionId}/results`)).json();
    expect(res.session).toMatchObject({ totalItems: 10, maxScore: 15 });
    expect(res.people.find((p: { code: string }) => p.code === 'SV001')).toMatchObject({
      rawScore: 15,
      scaledScore: 10,
    });
    const list = (await an.taker.call('GET', '/take/sessions')).json();
    expect(list.items.find((i: { sessionId: string }) => i.sessionId === sessionId)).toMatchObject({
      questionCount: 10,
    });
  });
});
