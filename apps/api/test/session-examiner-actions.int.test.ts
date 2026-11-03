import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';

// S2/S4 (Q254, Q258, Q259): Buộc nộp, Vi phạm, Đóng và Mở lại cửa vào thi qua HTTP + PostgreSQL thật.

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
  live = await openLiveSession(t);
});

const forceSubmit = (body: Record<string, unknown>, who = live.examiner) =>
  live.api('POST', `/sessions/${live.sessionId}/force-submit`, body, who);
const violate = (name: string, body: Record<string, unknown>, who = live.examiner) =>
  live.api(
    'POST',
    `/sessions/${live.sessionId}/attempts/${live.attemptIds[name]}/violations`,
    body,
    who,
  );
const closeEntry = (who = live.examiner) =>
  live.api('POST', `/sessions/${live.sessionId}/close-entry`, {}, who);
const reopenEntry = (who = live.examiner) =>
  live.api('POST', `/sessions/${live.sessionId}/reopen-entry`, {}, who);
const lastAudit = async () =>
  (await sql<{ action: string }>(`select action from audit_logs order by id desc limit 1`))[0]
    ?.action;

/** Một câu trả lời đã lưu cho Lượt của `name`, để kiểm Câu trả lời được giữ sau khi đóng Lượt. */
async function saveOneAnswer(name: string) {
  const taker = live.takers[name] as Taker;
  const view = (await taker.call('GET', `/take/attempts/${live.attemptIds[name]}`)).json();
  const single = view.sections[0].items.find((i: { type: string }) => i.type === 'single_choice');
  const saved = await taker.call('PUT', `/take/attempts/${live.attemptIds[name]}/responses`, {
    items: [{ itemId: single.itemId, value: { optionId: 'o1' }, clientSeq: 1 }],
  });
  expect(saved.statusCode, saved.body).toBe(200);
}
const responseCount = async (name: string) =>
  (
    await sql<{ n: string }>(`select count(*) n from responses where attempt_id = $1`, [
      live.attemptIds[name],
    ])
  )[0]?.n;

describe('Buộc nộp (Q254)', () => {
  it('nộp một Lượt với lý do examiner, giữ Câu trả lời; Lượt khác vẫn đang làm', async () => {
    await saveOneAnswer('an');
    const res = await forceSubmit({ attemptIds: [live.attemptIds.an] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ closed: 1, skipped: 0 });
    expect(await live.attemptRow('an')).toMatchObject({
      status: 'submitted',
      submit_reason: 'examiner',
    });
    expect((await live.attemptRow('binh')).status).toBe('in_progress');
    expect(await responseCount('an')).toBe('1');
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    expect(view.status).toBe('submitted');
    expect(view.attempt.submitReason).toBe('examiner');
    expect(await lastAudit()).toBe('session.force_submitted');
  });

  it('nhóm và cả phòng: chỉ Lượt đang làm bị nộp, người chưa vào không ảnh hưởng', async () => {
    const group = await forceSubmit({ attemptIds: [live.attemptIds.an, live.attemptIds.binh] });
    expect(group.json()).toEqual({ closed: 2, skipped: 0 });
    const all = await forceSubmit({ scope: 'all' });
    expect(all.json()).toEqual({ closed: 1, skipped: 0 });
    expect((await live.attemptRow('chi')).submit_reason).toBe('examiner');
    expect(await sql(`select 1 from attempts`)).toHaveLength(3); // Dũng chưa có Lượt, vẫn không có
  });

  it('làm lại cùng yêu cầu không đổi gì thêm; Lượt đã nộp được đếm là bỏ qua', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const again = await forceSubmit({ attemptIds: [live.attemptIds.an] });
    expect(again.json()).toEqual({ closed: 0, skipped: 1 });
    expect((await forceSubmit({ scope: 'all' })).json()).toEqual({ closed: 2, skipped: 0 });
    expect((await forceSubmit({ scope: 'all' })).json()).toEqual({ closed: 0, skipped: 0 });
  });

  it('Lượt không thuộc Phiên thi này thì cả yêu cầu bị từ chối, không Lượt nào bị nộp', async () => {
    const res = await forceSubmit({ attemptIds: [live.attemptIds.an, crypto.randomUUID()] });
    expect(res.statusCode).toBe(404);
    expect((await live.attemptRow('an')).status).toBe('in_progress');
  });

  it('hai lần Buộc nộp cùng lúc: mỗi Lượt chỉ bị đóng một lần (S4)', async () => {
    const [a, b] = await Promise.all([
      forceSubmit({ scope: 'all' }),
      forceSubmit({ scope: 'all' }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json().closed + b.json().closed).toBe(3);
  });

  it('Buộc nộp xen Lưu bài: không lỗi máy chủ, Lượt đã nộp và không có Câu trả lời ghi sau giờ nộp (S4)', async () => {
    await saveOneAnswer('an');
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    const item = view.sections[0].items.find((i: { type: string }) => i.type === 'essay');
    const [save, force] = await Promise.all([
      live.takers.an?.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
        items: [{ itemId: item.itemId, value: { text: 'bài làm' }, clientSeq: 1 }],
      }),
      forceSubmit({ attemptIds: [live.attemptIds.an] }),
    ]);
    expect([200, 409]).toContain(save?.statusCode);
    expect(force.statusCode).toBe(200);
    const row = await live.attemptRow('an');
    expect(row.status).toBe('submitted');
    const late = await sql(
      `select 1 from responses r join attempts a on a.id = r.attempt_id
       where r.attempt_id = $1 and r.saved_at > a.submitted_at`,
      [live.attemptIds.an],
    );
    expect(late).toHaveLength(0);
  });

  it('Phiên thi đã hủy thì không Buộc nộp; quyền: người khác 404, Người dự thi 403', async () => {
    const body = { attemptIds: [live.attemptIds.an] };
    expect((await forceSubmit(body, live.other)).statusCode).toBe(404);
    expect((await forceSubmit(body, live.takers.an?.cookie)).statusCode).toBe(403);
    await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    const res = await forceSubmit({ scope: 'all' });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('SESSION_CANCELLED');
  });

  it('nhật ký thao tác ghi rõ Lượt nào bị nộp', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an, live.attemptIds.binh] });
    const [row] = await sql<{ after: { attemptIds: string[] } }>(
      `select after from audit_logs where action = 'session.force_submitted'`,
    );
    expect([...(row?.after.attemptIds ?? [])].sort()).toEqual(
      [live.attemptIds.an, live.attemptIds.binh].sort(),
    );
  });

  it('thiếu hoặc thừa cách chọn thì báo lỗi dữ liệu', async () => {
    expect((await forceSubmit({})).statusCode).toBe(400);
    expect((await forceSubmit({ scope: 'all', attemptIds: [live.attemptIds.an] })).statusCode).toBe(
      400,
    );
  });
});

describe('Vi phạm: Cảnh cáo và Đình chỉ (Q259)', () => {
  it('Cảnh cáo ghi lý do, Lượt vẫn đang làm', async () => {
    const res = await violate('an', { action: 'warning', reason: 'Nhìn bài bạn bên cạnh' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().id).toBeTruthy();
    const rows = await sql<{ action: string; reason: string; penalty_type: string }>(
      `select action, reason, penalty_type from violations`,
    );
    expect(rows).toEqual([
      { action: 'warning', reason: 'Nhìn bài bạn bên cạnh', penalty_type: 'none' },
    ]);
    expect((await live.attemptRow('an')).status).toBe('in_progress');
    expect(await lastAudit()).toBe('session.violation_recorded');
  });

  it('Đình chỉ nộp Lượt ngay với lý do disqualified và giữ Câu trả lời', async () => {
    await saveOneAnswer('an');
    const res = await violate('an', { action: 'disqualify', reason: 'Dùng tài liệu' });
    expect(res.statusCode, res.body).toBe(201);
    expect(await live.attemptRow('an')).toMatchObject({
      status: 'submitted',
      submit_reason: 'disqualified',
    });
    expect(await responseCount('an')).toBe('1');
    expect(await sql(`select 1 from violations`)).toHaveLength(1);
  });

  it('lý do bắt buộc và tối đa 500 ký tự; hành động lạ bị từ chối', async () => {
    for (const bad of [
      { action: 'warning', reason: '  ' },
      { action: 'warning', reason: 'x'.repeat(501) },
      { action: 'ban', reason: 'x' },
      { action: 'warning' },
    ]) {
      expect((await violate('an', bad)).statusCode).toBe(400);
    }
    expect(await sql(`select 1 from violations`)).toHaveLength(0);
  });

  it('Lượt đã nộp thì không ghi Vi phạm; Đình chỉ không để lại dòng nào', async () => {
    await forceSubmit({ attemptIds: [live.attemptIds.an] });
    const res = await violate('an', { action: 'disqualify', reason: 'Dùng tài liệu' });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('ATTEMPT_CLOSED');
    expect(await sql(`select 1 from violations`)).toHaveLength(0);
  });

  it('quyền: người khác 404, Người dự thi 403, Lượt của Phiên thi khác 404', async () => {
    const body = { action: 'warning', reason: 'x' };
    expect((await violate('an', body, live.other)).statusCode).toBe(404);
    expect((await violate('an', body, live.takers.an?.cookie)).statusCode).toBe(403);
    const unknown = await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${crypto.randomUUID()}/violations`,
      body,
    );
    expect(unknown.statusCode).toBe(404);
  });
});

describe('Đóng và Mở lại cửa vào thi (Q258)', () => {
  it('Đóng cửa: người chưa vào bị chặn, người đang làm tiếp tục được', async () => {
    const res = await closeEntry();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().entryClosedAt).toBe(t.clock.now().toISOString());
    const dung = await Taker.signIn(t, 'dung');
    const join = await dung.join('AB3K9X');
    expect(join.json().reason).toBe('ENTRY_CLOSED');
    await saveOneAnswer('an'); // người đang làm vẫn lưu được
    const resume = await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(resume?.statusCode).toBe(200);
    expect(await lastAudit()).toBe('session.entry_closed');
  });

  it('Mở lại cửa: người chưa vào vào được', async () => {
    await closeEntry();
    const res = await reopenEntry();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().entryClosedAt).toBeNull();
    const dung = await Taker.signIn(t, 'dung');
    expect((await dung.join('AB3K9X')).statusCode).toBe(200);
    expect(await lastAudit()).toBe('session.entry_reopened');
  });

  it('làm lại cùng thao tác không đổi giờ đã đóng', async () => {
    const first = (await closeEntry()).json().entryClosedAt;
    t.clock.advance(minutes(5));
    expect((await closeEntry()).json().entryClosedAt).toBe(first);
    await reopenEntry();
    expect((await reopenEntry()).json().entryClosedAt).toBeNull();
  });

  it('đã đóng Khung giờ hoặc đã hủy thì không Đóng hay Mở lại', async () => {
    t.clock.set(new Date('2026-11-02T10:05:00+07:00'));
    for (const act of [closeEntry, reopenEntry]) {
      const res = await act();
      expect(res.statusCode).toBe(409);
      expect(res.json().reason).toBe('WINDOW_CLOSED');
    }
    t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
    await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    expect((await closeEntry()).json().reason).toBe('SESSION_CANCELLED');
  });

  it('quyền: người khác 404, Người dự thi 403', async () => {
    expect((await closeEntry(live.other)).statusCode).toBe(404);
    expect((await closeEntry(live.takers.an?.cookie)).statusCode).toBe(403);
  });

  it('Đóng cửa xen nhập mã: khi lệnh Đóng đã xong thì không ai bắt đầu Lượt mới được (S4)', async () => {
    const dung = await Taker.signIn(t, 'dung');
    await Promise.all([closeEntry(), dung.join('AB3K9X')]);
    const started = await dung.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(started.statusCode).toBe(409);
    expect(started.json().reason).toBe('ENTRY_CLOSED');
  });
});
