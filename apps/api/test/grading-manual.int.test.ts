import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import type { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S1–S5 (docs/plan/slice-5.md, PR 5b-1): chấm tay, bảng Kết quả, Mức xử lý, Ủy quyền qua HTTP + PostgreSQL thật. Bộ đề của
// `fullExam`: bốn câu 1 điểm (chọn một đáp án o2, chọn nhiều o1+o3 tỷ lệ, chùm bậc thang [0, 0,25, 1] s1 đúng s2 sai, tự luận).
// An làm đúng cả ba câu trắc nghiệm và viết tự luận; Bình viết tự luận, bỏ trống phần còn lại; Chi nộp bài trắng; Dũng không vào thi.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;
let items: Record<string, string>; // loại câu → itemId

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

async function answer(name: string, values: Record<string, unknown>) {
  const taker = live.takers[name] as Taker;
  const id = live.attemptIds[name];
  const view = (await taker.call('GET', `/take/attempts/${id}`)).json();
  items = Object.fromEntries(
    view.sections[0].items.map((i: { type: string; itemId: string }) => [i.type, i.itemId]),
  );
  const saved = await taker.call('PUT', `/take/attempts/${id}/responses`, {
    items: Object.entries(values).map(([type, value]) => ({
      itemId: items[type],
      value,
      clientSeq: 1,
    })),
  });
  expect(saved.statusCode, saved.body).toBe(200);
}

beforeEach(async () => {
  await resetState();
  live = await openLiveSession(t, ['an', 'binh', 'chi']);
  await answer('an', {
    single_choice: { optionId: 'o2' },
    multiple_choice: { optionIds: ['o1', 'o3'] },
    true_false_cluster: { answers: { s1: true, s2: false } },
    essay: { text: 'Bài tự luận của An' },
  });
  await answer('binh', { essay: { text: 'Bài tự luận của Bình' } });
  for (const name of ['an', 'binh', 'chi']) {
    await (live.takers[name] as Taker).call(
      'POST',
      `/take/attempts/${live.attemptIds[name]}/submit`,
    );
  }
  await t.queue.drain();
});

const api = (
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  who?: string,
) => call(t.app, method, `/api${path}`, { cookie: who ?? live.examiner, body });
const base = () => `/sessions/${live.sessionId}`;
const queue = async (filter = 'pending', who?: string) =>
  (
    await api(
      'GET',
      `${base()}/grading/items/${items.essay}/queue?filter=${filter}`,
      undefined,
      who,
    )
  ).json();
const grade = (name: string, score: number | null, feedback?: string, who?: string) =>
  api(
    'PUT',
    `${base()}/grading/attempts/${live.attemptIds[name]}/items/${items.essay}`,
    { score, feedback },
    who,
  );
const results = async (who?: string) =>
  (await api('GET', `${base()}/results`, undefined, who)).json();
const rowOf = (data: { people: { userId: string }[] }, name: string) =>
  data.people.find((p) => p.userId === live.userIds[name]) as Record<string, unknown>;

describe('Hàng đợi chấm tự luận (Q288, Q290–Q292)', () => {
  it('liệt kê câu tự luận kèm tiến độ; bài bỏ trống của Chi không vào hàng đợi', async () => {
    const res = await api('GET', `${base()}/grading/items`);
    expect(res.statusCode, res.body).toBe(200);
    const [item] = res.json().items;
    expect(item).toMatchObject({ no: 4, points: 1, total: 2, graded: 0, pending: 2 });
    expect(res.json().blind).toBe(true);
  });

  it('hàng đợi ẩn tên: nhãn "Bài N", thứ tự cố định giữa hai lần gọi, không có tên, mã hay userId', async () => {
    await api('GET', `${base()}/grading/items`); // nạp `items`
    const first = await queue();
    const second = await queue();
    expect(first.entries.map((e: { label: string }) => e.label)).toEqual(['Bài 1', 'Bài 2']);
    expect(first.entries).toEqual(second.entries);
    const text = JSON.stringify(first);
    for (const secret of [...Object.values(live.userIds), 'SV001', 'SV002', 'SV003', 'Nguyễn']) {
      expect(text).not.toContain(secret);
    }
  });

  it('bài: đề, hướng dẫn chấm và bài làm; tên chỉ hiện khi tắt Chấm ẩn tên', async () => {
    const entry = (await queue()).entries[0];
    const open = async () =>
      (
        await api('GET', `${base()}/grading/items/${items.essay}/attempts/${entry.attemptId}`)
      ).json();
    const blind = await open();
    expect(blind.item.rubric).toBeTruthy();
    expect(blind.answer).toMatch(/Bài tự luận của/);
    expect(blind.person).toBeUndefined();
    expect(JSON.stringify(blind)).not.toMatch(/SV00|userId/);

    const off = await api('PUT', `${base()}/grading/blind`, { blind: false });
    expect(off.json()).toEqual({ blind: false });
    const named = await open();
    expect(named.person).toMatchObject({
      fullName: expect.any(String),
      code: expect.stringMatching(/^SV00/),
    });
    const log = await sql(
      `select action from audit_logs where action = 'session.blind_grading_changed'`,
    );
    expect(log).toHaveLength(1);
  });
});

describe('Lưu điểm tay (Q290)', () => {
  it('lưu điểm trong khoảng, đổi kết luận, nhận xét được cắt khoảng trắng; về chờ chấm bằng null', async () => {
    await queue();
    const res = await grade('an', 0.75, '  Thiếu ý cuối  ');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ score: 0.75, verdict: 'partial', feedback: 'Thiếu ý cuối' });
    const after = await queue('all');
    expect(after.graded).toBe(1);
    expect(after.pending).toBe(1);
    // mặc định chỉ bài chưa chấm
    expect((await queue()).entries).toHaveLength(1);
    const cleared = await grade('an', null);
    expect(cleared.json()).toMatchObject({ score: null, verdict: 'pending' });
    expect((await queue()).entries).toHaveLength(2);
    expect((await grade('an', 1)).json().verdict).toBe('correct');
    expect((await grade('an', 0)).json().verdict).toBe('wrong');
  });

  it('điểm vượt tối đa, âm hoặc quá 2 chữ số bị từ chối; câu trắc nghiệm và bài lạ là 404', async () => {
    await queue();
    expect((await grade('an', 1.01)).statusCode).toBe(400);
    expect((await grade('an', -1)).statusCode).toBe(400);
    expect((await grade('an', 0.123)).statusCode).toBe(400);
    const mcq = await api(
      'PUT',
      `${base()}/grading/attempts/${live.attemptIds.an}/items/${items.single_choice}`,
      { score: 1 },
    );
    expect(mcq.statusCode).toBe(404);
    const stranger = await api(
      'PUT',
      `${base()}/grading/attempts/00000000-0000-4000-8000-000000000001/items/${items.essay}`,
      { score: 1 },
    );
    expect(stranger.statusCode).toBe(404);
  });

  it('lưu lại cùng một điểm cho cùng kết quả; hai Người chấm lưu cùng lúc không lỗi', async () => {
    await queue();
    const [a, b] = await Promise.all([grade('binh', 0.5), grade('binh', 0.25)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const final = (await queue('all')).entries.find(
      (e: { attemptId: string }) => e.attemptId === live.attemptIds.binh,
    );
    expect([0.5, 0.25]).toContain(final.score);
    expect((await grade('binh', final.score)).json().score).toBe(final.score);
  });
});

describe('Bảng Kết quả (Q295, Q291)', () => {
  it('Chấm ẩn tên bật và còn bài chờ chấm: chỉ điểm trắc nghiệm, không trả mã Lượt', async () => {
    const data = await results();
    expect(data.blind).toBe(true);
    expect(data.status).toMatchObject({
      pendingEssays: 2,
      essayHidden: true,
      submittedAttempts: 3,
    });
    const an = rowOf(data, 'an');
    expect(an).toMatchObject({
      state: 'hidden',
      essayHidden: true,
      rawScore: 3,
      maxScore: 4,
      scaledScore: 7.5,
      pendingEssays: null,
    });
    expect(an.countedAttemptId).toBeUndefined();
    expect(rowOf(data, 'dung')).toMatchObject({ state: 'no_attempt', rawScore: null });
    // không một mã Lượt nào xuất hiện trong bảng, và không nói người nào đã được chấm hết hay chưa
    for (const id of Object.values(live.attemptIds)) expect(JSON.stringify(data)).not.toContain(id);
    expect(new Set(data.people.map((p: { state: string }) => p.state))).toEqual(
      new Set(['hidden', 'no_attempt']),
    );
  });

  it('chấm xong thì có đủ điểm: 3,5/4 → 8,8 (làm tròn 0,1 từ 5 trở lên); Chi bài trắng = 0', async () => {
    await queue();
    await grade('an', 0.5);
    await grade('binh', 1);
    const data = await results();
    expect(data.status).toMatchObject({ pendingEssays: 0, essayHidden: false });
    expect(rowOf(data, 'an')).toMatchObject({
      state: 'graded',
      rawScore: 3.5,
      scaledScore: 8.8,
      countedAttemptId: live.attemptIds.an,
    });
    expect(rowOf(data, 'binh')).toMatchObject({ rawScore: 1, scaledScore: 2.5 });
    expect(rowOf(data, 'chi')).toMatchObject({ state: 'graded', rawScore: 0, scaledScore: 0 });
  });

  it('tắt Chấm ẩn tên thì hiện điểm đầy đủ dù còn bài chờ chấm', async () => {
    await api('PUT', `${base()}/grading/blind`, { blind: false });
    const data = await results();
    expect(data.status.essayHidden).toBe(false);
    expect(rowOf(data, 'an')).toMatchObject({
      rawScore: 3,
      essayHidden: false,
      state: 'waiting_essay',
    });
    expect(rowOf(data, 'an').countedAttemptId).toBe(live.attemptIds.an);
  });

  it('chi tiết một người: điểm từng câu, câu tự luận bị ẩn khi đang che', async () => {
    const hidden = (await api('GET', `${base()}/results/people/${live.userIds.an}`)).json();
    expect(hidden.essayHidden).toBe(true);
    const essay = hidden.attempts[0].items.find((i: { type: string }) => i.type === 'essay');
    expect(essay).toMatchObject({ score: null, verdict: 'hidden', source: null });
    expect(hidden.attempts[0].attemptId).toBeUndefined();
    await queue();
    await grade('an', 0.5, 'Khá');
    await grade('binh', 1);
    const full = (await api('GET', `${base()}/results/people/${live.userIds.an}`)).json();
    const shown = full.attempts[0].items.find((i: { type: string }) => i.type === 'essay');
    expect(shown).toMatchObject({
      score: 0.5,
      verdict: 'partial',
      source: 'manual',
      feedback: 'Khá',
    });
    expect(full.person.fullName).toBeTruthy();
  });

  it('Thống kê câu đếm đúng / một phần / sai / bỏ trống / chờ chấm', async () => {
    const stats = (await api('GET', `${base()}/results/item-stats`)).json();
    const byType = Object.fromEntries(stats.items.map((i: { type: string }) => [i.type, i]));
    expect(stats.attempts).toBe(3);
    expect(byType.single_choice).toMatchObject({
      correct: 1,
      blank: 2,
      wrong: 0,
      correctRate: 33.3,
    });
    expect(byType.essay).toMatchObject({ pending: 2, blank: 1 });
  });
});

describe('Nhiều Lượt, chấm bù và hàng đợi', () => {
  it('highest lấy Lượt cao nhất, latest lấy Lượt cuối; hàng đợi `all` và `pending` khác nhau', async () => {
    await api('PUT', `${base()}/grading/blind`, { blind: false });
    await sql(`update sessions set max_attempts = 2 where id = $1`, [live.sessionId]);
    const an = live.takers.an as Taker;
    const second = (await an.call('POST', `/take/sessions/${live.sessionId}/start`)).json();
    expect(second.attempt.id).not.toBe(live.attemptIds.an);
    const view = (await an.call('GET', `/take/attempts/${second.attempt.id}`)).json();
    const single = view.sections[0].items.find((i: { type: string }) => i.type === 'single_choice');
    await an.call('PUT', `/take/attempts/${second.attempt.id}/responses`, {
      items: [{ itemId: single.itemId, value: { optionId: 'o2' }, clientSeq: 1 }],
    });
    await an.call('POST', `/take/attempts/${second.attempt.id}/submit`);
    await t.queue.drain();

    // highest: Lượt 1 được 3 điểm trắc nghiệm, Lượt 2 chỉ 1 điểm
    expect(rowOf(await results(), 'an')).toMatchObject({ rawScore: 3, attemptCount: 2 });
    // hàng đợi gồm cả hai Lượt của An (highest) cộng bài của Bình; Lượt 2 bỏ trống tự luận nên không vào
    expect((await queue('all')).total).toBe(2);
    await sql(`update sessions set attempt_scoring = 'latest' where id = $1`, [live.sessionId]);
    expect(rowOf(await results(), 'an')).toMatchObject({
      rawScore: 1,
      countedAttemptId: second.attempt.id,
    });
    // latest: Lượt 1 của An không còn có thể được tính nên không còn trong hàng đợi
    expect((await queue('all')).total).toBe(1);
    expect((await grade('an', 0.5)).statusCode).toBe(404);
  });

  it('mở Kết quả chấm bù Lượt chưa có dấu "đã chấm"', async () => {
    await sql(`delete from response_grades where attempt_id = $1`, [live.attemptIds.binh]);
    await sql(`delete from attempt_grades where attempt_id = $1`, [live.attemptIds.binh]);
    const data = await results();
    expect(rowOf(data, 'binh')).toMatchObject({ attemptCount: 1 });
    expect(
      await sql(`select 1 from attempt_grades where attempt_id = $1`, [live.attemptIds.binh]),
    ).toHaveLength(1);
  });
});

describe('Mức xử lý Vi phạm (Q294)', () => {
  // Vi phạm chỉ ghi được khi Lượt đang làm (lát cắt 4); ở đây dựng bằng SQL vì các Lượt đã nộp.
  const violation = async () => {
    await sql(
      `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
       values (gen_random_uuid(), $1, $2, $3, 'warning', 'Nhìn bài bạn', $4)`,
      [live.attemptIds.an, live.sessionId, live.userIds.an, await userId('gv1')],
    );
  };

  it('danh sách Vi phạm không lộ mã Lượt; đặt trừ phần trăm đổi Kết quả; Hủy cho 0', async () => {
    await violation();
    await queue();
    await grade('an', 0.5);
    await grade('binh', 1);
    const list = (await api('GET', `${base()}/violations`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ penaltyType: 'none', penaltyDecidedAt: null });
    expect(JSON.stringify(list)).not.toContain(live.attemptIds.an);
    expect((await results()).status.violationsUndecided).toBe(1);

    const id = list.items[0].id as string;
    const set = await api('PUT', `${base()}/violations/${id}/penalty`, {
      type: 'percent',
      percent: 10,
    });
    expect(set.statusCode, set.body).toBe(200);
    const after = await results();
    expect(after.status.violationsUndecided).toBe(0);
    expect(rowOf(after, 'an')).toMatchObject({ penaltyPercent: 10, voided: false, rawScore: 3.5 });
    expect(rowOf(after, 'an').scaledScore).toBe(7.9); // 3,15 / 4 × 10 = 7,875

    await api('PUT', `${base()}/violations/${id}/penalty`, { type: 'void' });
    expect(rowOf(await results(), 'an')).toMatchObject({ voided: true, scaledScore: 0 });
    await api('PUT', `${base()}/violations/${id}/penalty`, { type: 'none' });
    expect(rowOf(await results(), 'an')).toMatchObject({ voided: false, scaledScore: 8.8 });
    expect(await sql(`select 1 from audit_logs where action = 'session.penalty_set'`)).toHaveLength(
      3,
    );
  });

  it('nhiều Vi phạm cộng dồn, tối đa trừ 100 %', async () => {
    await violation();
    await violation();
    await api('PUT', `${base()}/grading/blind`, { blind: false });
    const ids = (await api('GET', `${base()}/violations`))
      .json()
      .items.map((v: { id: string }) => v.id);
    await api('PUT', `${base()}/violations/${ids[0]}/penalty`, { type: 'percent', percent: 70 });
    await api('PUT', `${base()}/violations/${ids[1]}/penalty`, { type: 'percent', percent: 60 });
    expect(rowOf(await results(), 'an')).toMatchObject({
      penaltyPercent: 100,
      scaledScore: 0,
      voided: false,
    });
  });

  it('phần trăm ngoài 1–100 hoặc thiếu bị từ chối; Vi phạm lạ là 404', async () => {
    await violation();
    const id = (await api('GET', `${base()}/violations`)).json().items[0].id as string;
    for (const body of [
      { type: 'percent', percent: 0 },
      { type: 'percent', percent: 101 },
      { type: 'percent' },
      { type: 'x' },
    ]) {
      expect((await api('PUT', `${base()}/violations/${id}/penalty`, body)).statusCode).toBe(400);
    }
    const missing = await api(
      'PUT',
      `${base()}/violations/00000000-0000-4000-8000-000000000002/penalty`,
      { type: 'none' },
    );
    expect(missing.statusCode).toBe(404);
  });
});

describe('Quyền truy cập và Ủy quyền (Q292, Q307)', () => {
  it('Người ra đề khác chủ và Người dự thi không vào được bất kỳ đường nào', async () => {
    for (const path of [
      `${base()}/results`,
      `${base()}/grading/items`,
      `${base()}/violations`,
      `${base()}/grading/blind`,
    ]) {
      expect((await api('GET', path, undefined, live.other)).statusCode, path).toBe(404);
    }
    const an = live.takers.an as Taker;
    expect((await an.call('GET', `${base()}/results`)).statusCode).toBeGreaterThanOrEqual(403);
  });

  it('chủ cấp Ủy quyền: người nhận chấm và xem Kết quả, nhận thông báo; thu hồi thì mất quyền', async () => {
    const granted = await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json().delegate).toMatchObject({ userId: await userId('gv2') });
    // cấp lại cho cùng người không sinh thông báo hay nhật ký thừa
    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(200);
    await queue();
    expect((await grade('an', 0.5, undefined, live.other)).statusCode).toBe(200);
    expect(
      (await api('GET', '/grading/delegated-sessions', undefined, live.other)).json().items,
    ).toHaveLength(1);
    expect(
      await sql(`select 1 from notifications where type = 'session.grading_delegated'`),
    ).toHaveLength(1);

    // người được Ủy quyền không ủy quyền tiếp
    expect((await api('GET', `${base()}/grading-delegate`, undefined, live.other)).statusCode).toBe(
      404,
    );
    expect(
      (await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv1') }, live.other))
        .statusCode,
    ).toBe(404);

    const revoked = await api('DELETE', `${base()}/grading-delegate`);
    expect(revoked.json()).toEqual({ delegate: null });
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(404);
    expect(
      await sql(`select 1 from notifications where type = 'session.grading_delegate_revoked'`),
    ).toHaveLength(1);
    expect(
      await sql(`select action from audit_logs where action like 'session.grading_delegat%'`),
    ).toHaveLength(2);
  });

  it('không ủy quyền cho chính chủ, người không phải Người ra đề, người trong Danh sách dự thi', async () => {
    const reason = async (id: string) => {
      const res = await api('PUT', `${base()}/grading-delegate`, { userId: id });
      expect(res.statusCode, res.body).toBe(409);
      return res.json().reason;
    };
    expect(await reason(await userId('gv1'))).toBe('DELEGATE_IS_OWNER');
    expect(await reason(live.userIds.an as string)).toBe('DELEGATE_NOT_EXAMINER');
    // người vừa là Người ra đề vừa có tên trong Danh sách dự thi
    const both = await seedUser({ username: 'gv3', roleTags: ['examiner', 'candidate'] });
    await api('POST', `${base()}/roster`, { userIds: [both.id] });
    expect(await reason(both.id)).toBe('DELEGATE_IN_ROSTER');
  });

  it('chỉ một người được Ủy quyền cùng lúc: cấp người mới thì người cũ bị thay', async () => {
    const gv3 = await seedUser({ username: 'gv3', roleTags: ['examiner'] });
    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    await api('PUT', `${base()}/grading-delegate`, { userId: gv3.id });
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(404);
    const current = (await api('GET', `${base()}/grading-delegate`)).json();
    expect(current.delegate.userId).toBe(gv3.id);
    expect(
      await sql(`select 1 from session_grading_delegates where revoked_at is null`),
    ).toHaveLength(1);
  });

  it('người được Ủy quyền bị thêm vào Danh sách dự thi thì mất quyền', async () => {
    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(200);
    await sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
      live.sessionId,
      await userId('gv2'),
      await userId('gv1'),
    ]);
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(404);
  });

  it('Quản trị viên tìm Phiên thi, cấp và thu hồi; Người ra đề thường không vào đường quản trị', async () => {
    await seedUser({ username: 'quantri', isAdmin: true });
    const admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
    const found = (
      await api('GET', `/admin/sessions?q=${encodeURIComponent('giữa')}`, undefined, admin)
    ).json();
    expect(found.items.map((s: { sessionId: string }) => s.sessionId)).toContain(live.sessionId);
    const pick = (
      await api(
        'GET',
        `/admin/sessions/${live.sessionId}/grading-delegate/candidates?q=nguyen`,
        undefined,
        admin,
      )
    ).json();
    expect(pick.items.map((u: { id: string }) => u.id)).toContain(await userId('gv2'));
    expect(pick.items.map((u: { id: string }) => u.id)).not.toContain(await userId('gv1')); // chủ
    const grant = await api(
      'PUT',
      `/admin/sessions/${live.sessionId}/grading-delegate`,
      { userId: await userId('gv2') },
      admin,
    );
    expect(grant.statusCode, grant.body).toBe(200);
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(200);
    await api('DELETE', `/admin/sessions/${live.sessionId}/grading-delegate`, undefined, admin);
    expect((await api('GET', `${base()}/results`, undefined, live.other)).statusCode).toBe(404);
    expect((await api('GET', '/admin/sessions', undefined, live.examiner)).statusCode).toBe(403);
  });
});

async function userId(username: string) {
  const [row] = await sql<{ id: string }>(`select id from users where username = $1`, [username]);
  return row?.id as string;
}

describe('Trigger (S3)', () => {
  it('chấm tay không ghi đè điểm trắc nghiệm; Ủy quyền hiệu lực thứ hai, sửa và xóa trái phép bị từ chối', async () => {
    const gv1 = await userId('gv1');
    await expect(
      sql(
        `update response_grades set source = 'manual', graded_by = $2 where attempt_id = $1 and item_id = $3`,
        [live.attemptIds.an, gv1, items.single_choice],
      ),
    ).rejects.toThrow(/tu luan/);
    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    await expect(
      sql(
        `insert into session_grading_delegates (id, session_id, user_id, granted_by) values (gen_random_uuid(), $1, $2, $3)`,
        [live.sessionId, await userId('gv2'), gv1],
      ),
    ).rejects.toThrow();
    await expect(sql(`delete from session_grading_delegates`)).rejects.toThrow(/khong xoa/);
    await expect(sql(`update session_grading_delegates set user_id = $1`, [gv1])).rejects.toThrow(
      /thu hoi mot lan/,
    );
  });
});
