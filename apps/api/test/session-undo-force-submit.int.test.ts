import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';

// S2/S4 (Q273–Q280): Hoàn tác Buộc nộp qua HTTP + PostgreSQL thật. Giờ giả bắt đầu 2/11/2026 08:00 (GMT+7); Phiên thi mở 07:00,
// đóng 10:00, Thời lượng 45 phút nên Lượt bắt đầu 08:00 có hạn 08:45.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await resetState();
  live = await openLiveSession(t, ['an', 'binh', 'chi'], { maxAttempts: 2 });
});

const forceSubmit = (body: Record<string, unknown> = { scope: 'all' }) =>
  live.api('POST', `/sessions/${live.sessionId}/force-submit`, body);
const undo = (name: string, who = live.examiner) =>
  live.api(
    'POST',
    `/sessions/${live.sessionId}/attempts/${live.attemptIds[name]}/undo-force-submit`,
    {},
    who,
  );
const undoAll = (who = live.examiner) =>
  live.api('POST', `/sessions/${live.sessionId}/undo-force-submit`, {}, who);
const monitor = async () =>
  (await live.api('GET', `/sessions/${live.sessionId}/monitor`)).json() as {
    summary: { undoable: number; submitted: number; working: number };
    people: { userId: string; state: string; undoUntil: string | null }[];
  };
const person = async (name: string) =>
  (await monitor()).people.find((p) => p.userId === live.userIds[name]);
const attemptsOf = (name: string) =>
  sql<{ id: string; status: string; submit_reason: string | null; attempt_no: number }>(
    `select id, status, submit_reason, attempt_no from attempts where user_id = $1 order by attempt_no`,
    [live.userIds[name]],
  );
const reasonOf = (res: { json: () => { reason?: string } }) => res.json().reason;

/** Một câu trả lời đã lưu cho Lượt của `name`, để kiểm Câu trả lời còn nguyên sau Buộc nộp rồi Hoàn tác. */
async function saveOneAnswer(name: string) {
  const taker = live.takers[name] as Taker;
  const id = live.attemptIds[name];
  const view = (await taker.call('GET', `/take/attempts/${id}`)).json();
  const single = view.sections[0].items.find((i: { type: string }) => i.type === 'single_choice');
  const saved = await taker.call('PUT', `/take/attempts/${id}/responses`, {
    items: [{ itemId: single.itemId, value: { optionId: 'o1' }, clientSeq: 1 }],
  });
  expect(saved.statusCode, saved.body).toBe(200);
  return single.itemId as string;
}
const answers = (name: string) =>
  sql<{ item_id: string; value: unknown }>(
    `select item_id, value from responses where attempt_id = $1 order by item_id`,
    [live.attemptIds[name]],
  );

describe('Hoàn tác một Lượt bị Buộc nộp (Q273, Q275)', () => {
  it('mở lại Lượt: giữ Câu trả lời, hạn mới = lúc hoàn tác + phần còn lại lúc bị nộp, làm tiếp được', async () => {
    const itemId = await saveOneAnswer('an');
    const before = await answers('an');
    await forceSubmit({ attemptIds: [live.attemptIds.an] }); // 08:00, còn 45 phút
    expect((await live.attemptRow('an')).status).toBe('submitted');

    t.clock.advance(minutes(3)); // hoàn tác lúc 08:03
    const res = await undo('an');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ attemptId: live.attemptIds.an });
    expect(new Date(res.json().deadline).toISOString()).toBe(
      new Date('2026-11-02T08:48:00+07:00').toISOString(),
    );

    expect(await live.attemptRow('an')).toMatchObject({
      status: 'in_progress',
      submit_reason: null,
    });
    expect((await live.attemptRow('an')).deadline.toISOString()).toBe(
      new Date('2026-11-02T08:48:00+07:00').toISOString(),
    );
    expect(await answers('an')).toEqual(before); // dữ liệu chính xác, không mất, không thêm
    expect(await attemptsOf('an')).toHaveLength(1); // không tạo Lượt mới

    // Người dự thi làm tiếp ngay: xem đề thấy đáp án cũ, lưu thêm được, heartbeat báo đang làm với hạn mới.
    const taker = live.takers.an as Taker;
    const view = (await taker.call('GET', `/take/attempts/${live.attemptIds.an}`)).json();
    expect(view.status).toBe('in_progress');
    const mine = view.sections[0].items.find((i: { itemId: string }) => i.itemId === itemId);
    expect(mine.response?.value).toEqual({ optionId: 'o1' });
    const saved = await taker.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
      items: [{ itemId, value: { optionId: 'o2' }, clientSeq: 2 }],
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const beat = (
      await taker.call('POST', `/take/attempts/${live.attemptIds.an}/heartbeat`, {})
    ).json();
    expect(beat.status).toBe('in_progress');
    const noticed = (
      await taker.call('POST', `/take/attempts/${live.attemptIds.an}/heartbeat`, {
        since: new Date('2026-11-02T07:59:00+07:00').toISOString(),
      })
    ).json();
    expect(noticed.notices).toContainEqual(
      expect.objectContaining({
        kind: 'reopened',
        at: new Date('2026-11-02T08:03:00+07:00').toISOString(),
      }),
    );
    expect(new Date(beat.deadline).toISOString()).toBe(
      new Date('2026-11-02T08:48:00+07:00').toISOString(),
    );

    // Nhật ký: bảng chỉ ghi thêm và nhật ký thao tác.
    const log = await sql<{ new_deadline: Date; previous_submitted_at: Date }>(
      `select new_deadline, previous_submitted_at from attempt_reopenings where attempt_id = $1`,
      [live.attemptIds.an],
    );
    expect(log).toHaveLength(1);
    expect(log[0]?.previous_submitted_at.toISOString()).toBe(
      new Date('2026-11-02T08:00:00+07:00').toISOString(),
    );
    const audit = await sql<{ action: string; after: { attemptIds: string[] } }>(
      `select action, after from audit_logs where action = 'session.force_submit_undone'`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after.attemptIds).toEqual([live.attemptIds.an]);
  });

  it('người khác trong phòng không bị ảnh hưởng', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    await undo('an');
    expect((await live.attemptRow('binh')).status).toBe('in_progress');
    expect((await live.attemptRow('chi')).status).toBe('in_progress');
  });

  it('màn Theo dõi: người bị Buộc nộp có undoUntil (10 phút), tổng hợp có số có thể hoàn tác; hoàn tác xong thì hết', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an, live.attemptIds.binh] });
    const m = await monitor();
    expect(m.summary.undoable).toBe(2);
    const an = m.people.find((p) => p.userId === live.userIds.an);
    expect(an).toMatchObject({ state: 'submitted' });
    expect(an?.undoUntil).toBe(new Date('2026-11-02T08:10:00+07:00').toISOString());
    expect((await person('chi'))?.undoUntil).toBeNull();

    await undo('an');
    const after = await monitor();
    expect(after.summary.undoable).toBe(1);
    expect(after.people.find((p) => p.userId === live.userIds.an)).toMatchObject({
      state: 'working',
      undoUntil: null,
    });

    t.clock.advance(minutes(10) + 1);
    expect((await monitor()).summary.undoable).toBe(0);
    expect((await person('binh'))?.undoUntil).toBeNull();
  });
});

describe('lý do từ chối (Q276)', () => {
  it('quá 10 phút: UNDO_WINDOW_PASSED; đúng 10 phút còn hoàn tác được', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an, live.attemptIds.binh] });
    t.clock.advance(minutes(10));
    expect((await undo('an')).statusCode).toBe(200);
    t.clock.advance(1);
    const late = await undo('binh');
    expect(late.statusCode).toBe(409);
    expect(reasonOf(late)).toBe('UNDO_WINDOW_PASSED');
    expect((await live.attemptRow('binh')).status).toBe('submitted');
  });

  it('Lượt đang làm, Người dự thi tự nộp, Đình chỉ: NOT_FORCE_SUBMITTED, Lượt giữ nguyên', async () => {
    expect(reasonOf(await undo('an'))).toBe('NOT_FORCE_SUBMITTED'); // đang làm
    await live.takers.binh?.call('POST', `/take/attempts/${live.attemptIds.binh}/submit`);
    expect(reasonOf(await undo('binh'))).toBe('NOT_FORCE_SUBMITTED');
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.chi}/violations`,
      { action: 'disqualify', reason: 'Dùng tài liệu' },
    );
    expect(reasonOf(await undo('chi'))).toBe('NOT_FORCE_SUBMITTED');
    expect(await live.attemptRow('binh')).toMatchObject({ submit_reason: 'candidate' });
    expect(await live.attemptRow('chi')).toMatchObject({ submit_reason: 'disqualified' });
  });

  it('đã bắt đầu Lượt mới: NEW_ATTEMPT_STARTED, không có hai Lượt cùng đang làm', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const fresh = await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(fresh?.statusCode, fresh?.body).toBe(200);
    const res = await undo('an');
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('NEW_ATTEMPT_STARTED');
    const rows = await attemptsOf('an');
    expect(rows.map((r) => r.status)).toEqual(['submitted', 'in_progress']);
  });

  it('Phiên thi đã Hủy: SESSION_CANCELLED', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    const res = await undo('an');
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('SESSION_CANCELLED');
  });

  it('Lượt đã quá hạn lúc bị nộp: ATTEMPT_EXPIRED', async () => {
    t.clock.set(new Date('2026-11-02T08:45:10+07:00')); // quá hạn 10 giây nhưng còn trong ân hạn 30 giây
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const res = await undo('an');
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('ATTEMPT_EXPIRED');
  });

  it('Cắt cứng mà giờ đóng gần: hạn mới không vượt giờ đóng', async () => {
    await resetState();
    live = await openLiveSession(t, ['an'], { maxAttempts: 2, hardClose: true });
    t.clock.set(new Date('2026-11-02T09:40:00+07:00'));
    // Lượt đã bắt đầu lúc 08:00 hạn 08:45; thêm giờ để còn ở 09:40: dùng Cộng giờ 60 phút → hạn 09:45
    t.clock.set(new Date('2026-11-02T08:30:00+07:00'));
    await live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      scope: 'all',
      minutes: 60,
      reason: 'Mạng chậm',
      batchId: '00000000-0000-4000-8000-0000000000aa',
    });
    t.clock.set(new Date('2026-11-02T09:40:00+07:00'));
    await forceSubmit({ attemptIds: [live.attemptIds.an] }); // còn 5 phút (hạn 09:45)
    t.clock.set(new Date('2026-11-02T09:41:00+07:00'));
    const res = await undo('an');
    expect(res.statusCode, res.body).toBe(200);
    // 09:41 + 5 phút = 09:46 vẫn trước giờ đóng 10:00, nên không bị cắt
    expect(new Date(res.json().deadline).toISOString()).toBe(
      new Date('2026-11-02T09:46:00+07:00').toISOString(),
    );
  });
});

describe('quyền (Q273)', () => {
  it('Người ra đề khác 404, Người dự thi 403, Lượt lạ 404; Lượt không đổi', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    expect((await undo('an', live.other)).statusCode).toBe(404);
    expect((await undo('an', live.takers.an?.cookie)).statusCode).toBe(403);
    const unknown = await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${crypto.randomUUID()}/undo-force-submit`,
      {},
    );
    expect(unknown.statusCode).toBe(404);
    expect((await undoAll(live.other)).statusCode).toBe(404);
    expect((await live.attemptRow('an')).status).toBe('submitted');
  });
});

describe('hoàn tác cả lô trong 10 phút qua (Q278)', () => {
  it('chỉ mở lại những Lượt đủ điều kiện, báo các Lượt bị bỏ qua và lý do', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] }); // 08:00
    t.clock.advance(minutes(8));
    await forceSubmit({ attemptIds: [live.attemptIds.binh, live.attemptIds.chi] }); // 08:08
    // chi bắt đầu Lượt mới nên không mở lại được
    await live.takers.chi?.call('POST', `/take/sessions/${live.sessionId}/start`);
    t.clock.advance(minutes(3)); // 08:11: an đã quá 10 phút (11 phút), binh còn 3 phút
    const res = await undoAll();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ reopened: 1 });
    expect(res.json().skipped).toEqual([
      { attemptId: live.attemptIds.chi, problem: 'NEW_ATTEMPT_STARTED' },
    ]);
    expect((await live.attemptRow('binh')).status).toBe('in_progress');
    expect((await live.attemptRow('an')).status).toBe('submitted'); // quá cửa sổ: ngoài phạm vi lô
    expect((await attemptsOf('chi')).map((r) => r.status)).toEqual(['submitted', 'in_progress']);
    const audit = await sql<{ after: { attemptIds: string[] } }>(
      `select after from audit_logs where action = 'session.force_submit_undone'`,
    );
    expect(audit[0]?.after.attemptIds).toEqual([live.attemptIds.binh]);
  });

  it('không có Lượt nào để hoàn tác thì trả reopened 0, không lỗi', async () => {
    const res = await undoAll();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reopened: 0, skipped: [] });
  });
});

describe('đồng thời (S4)', () => {
  it('hoàn tác xen Người dự thi bắt đầu Lượt mới: một kết cục nhất quán, không bao giờ hai Lượt cùng đang làm', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const [undone, started] = await Promise.all([
      undo('an'),
      live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`),
    ]);
    const rows = await attemptsOf('an');
    const running = rows.filter((r) => r.status === 'in_progress');
    expect(running).toHaveLength(1);
    if (undone.statusCode === 200) {
      expect(rows).toHaveLength(1); // start thấy Lượt đã mở lại và làm tiếp, không tạo Lượt mới
      expect(started?.json().attempt.id).toBe(live.attemptIds.an);
    } else {
      expect(reasonOf(undone)).toBe('NEW_ATTEMPT_STARTED');
      expect(rows).toHaveLength(2);
    }
  });

  it('hoàn tác hai lần cùng lúc: một lần thành công, lần kia bị từ chối; một dòng nhật ký', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const [a, b] = await Promise.all([undo('an'), undo('an')]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await sql(`select 1 from attempt_reopenings`)).toHaveLength(1);
    expect((await live.attemptRow('an')).status).toBe('in_progress');
  });

  it('sau khi mở lại, Người dự thi tự nộp thì không hoàn tác lại được; Buộc nộp lần hai lại hoàn tác được', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    await undo('an');
    t.clock.advance(1000);
    await forceSubmit({ attemptIds: [live.attemptIds.an] }); // lần nộp mới, thời điểm mới
    t.clock.advance(minutes(1));
    expect((await undo('an')).statusCode).toBe(200);
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    expect(reasonOf(await undo('an'))).toBe('NOT_FORCE_SUBMITTED');
    expect(await sql(`select 1 from attempt_reopenings`)).toHaveLength(2);
  });
});

describe('thời gian đáp ứng (ngân sách: một người < 300 ms, lô 100 người < 500 ms)', () => {
  it('hoàn tác một người và cả lô 100 người', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const one = performance.now();
    const res = await undo('an');
    const oneMs = performance.now() - one;
    expect(res.statusCode).toBe(200);
    console.info(`Hoàn tác một người: ${oneMs.toFixed(0)} ms`);
    expect(oneMs).toBeLessThan(300);

    await sql(
      `insert into users (id, username, code, full_name, password_hash, class_label)
       select gen_random_uuid(), 'bulk' || g, 'B' || lpad(g::text, 4, '0'), 'Sinh viên ' || g, 'x', 'K65'
       from generate_series(1, 100) g`,
    );
    await sql(
      `insert into user_role_tags (user_id, tag) select id, 'candidate' from users where username like 'bulk%'`,
    );
    await sql(
      `insert into session_roster (session_id, user_id, added_by)
       select $1, id, (select owner_id from sessions where id = $1) from users where username like 'bulk%'`,
      [live.sessionId],
    );
    await sql(
      `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status, submitted_at, submit_reason)
       select gen_random_uuid(), $1, u.id, 1, 1, '{"sections":[]}'::jsonb, $2::timestamptz - interval '2 minutes',
              $2::timestamptz + interval '43 minutes', 'submitted', $2::timestamptz - interval '1 minute', 'examiner'
       from users u where u.username like 'bulk%'`,
      [live.sessionId, t.clock.now()],
    );
    const batch = performance.now();
    const all = await undoAll();
    const batchMs = performance.now() - batch;
    console.info(`Hoàn tác cả lô 100 người: ${batchMs.toFixed(0)} ms`);
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().reopened).toBe(100);
    expect(batchMs).toBeLessThan(500);
    const running = await sql<{ n: string }>(
      `select count(*) n from attempts a join users u on u.id = a.user_id where u.username like 'bulk%' and a.status = 'in_progress' and a.submit_reason is null and a.submitted_at is null`,
    );
    expect(Number(running[0]?.n)).toBe(100);
  });
});
