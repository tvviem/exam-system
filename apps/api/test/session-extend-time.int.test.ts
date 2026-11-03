import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptSweepJob } from '../src/modules/attempt/attempt-sweep.job';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';

// S2 (Q254, Q256, Q262): Cộng giờ qua HTTP + PostgreSQL thật, một Lượt, một nhóm và cả phòng.

let t: TestApp;
let examiner: string;
let other: string;
let sessionId: string;
let takers: Record<string, Taker>;
let attemptIds: Record<string, string>;
let examinerApi: Live['api'];

type Live = Awaited<ReturnType<typeof openLiveSession>>;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const batch = () => crypto.randomUUID();
const extend = (body: Record<string, unknown>, who = examiner) =>
  examinerApi('POST', `/sessions/${sessionId}/extend-time`, body, who);
const deadlineOf = async (name: string) =>
  (
    await sql<{ deadline: Date }>(`select deadline from attempts where id = $1`, [attemptIds[name]])
  )[0]?.deadline.getTime() as number;

beforeEach(async () => {
  await resetState();
  ({ examiner, other, sessionId, takers, attemptIds, api: examinerApi } = await openLiveSession(t));
});

describe('Cộng giờ cho một Lượt', () => {
  it('cộng đúng số phút vào hạn, ghi nhật ký và nhật ký thao tác; Người dự thi thấy hạn mới', async () => {
    const before = await deadlineOf('an');
    const res = await extend({
      attemptIds: [attemptIds.an],
      minutes: 15,
      reason: 'Mất điện',
      batchId: batch(),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ extended: 1, skipped: 0 });
    expect(await deadlineOf('an')).toBe(before + 15 * 60_000);
    const view = (await takers.an?.call('GET', `/take/attempts/${attemptIds.an}`))?.json();
    expect(new Date(view.attempt.deadline).getTime()).toBe(before + 15 * 60_000);

    const rows = await sql<{ minutes: number; scope: string; reason: string }>(
      `select minutes, scope, reason from attempt_time_extensions`,
    );
    expect(rows).toEqual([{ minutes: 15, scope: 'one', reason: 'Mất điện' }]);
    const logs = await sql<{ action: string }>(
      `select action from audit_logs order by id desc limit 1`,
    );
    expect(logs[0]?.action).toBe('session.time_extended');
  });

  it('Lượt khác không bị đổi', async () => {
    const binhBefore = await deadlineOf('binh');
    await extend({ attemptIds: [attemptIds.an], minutes: 5, reason: 'x', batchId: batch() });
    expect(await deadlineOf('binh')).toBe(binhBefore);
  });
});

describe('Cộng giờ cho một nhóm và cả phòng (Q254)', () => {
  it('nhóm: mỗi Lượt một dòng nhật ký cùng mã lô, phạm vi group', async () => {
    const id = batch();
    const res = await extend({
      attemptIds: [attemptIds.an, attemptIds.binh],
      minutes: 10,
      reason: 'Mạng chậm',
      batchId: id,
    });
    expect(res.json()).toEqual({ extended: 2, skipped: 0 });
    const rows = await sql<{ scope: string; batch_id: string }>(
      `select scope, batch_id from attempt_time_extensions`,
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.scope))).toEqual(new Set(['group']));
    expect(new Set(rows.map((r) => r.batch_id))).toEqual(new Set([id]));
  });

  it('cả phòng: mọi Lượt đang làm được cộng; người chưa vào và Lượt đã nộp thì không', async () => {
    await takers.chi?.call('POST', `/take/attempts/${attemptIds.chi}/submit`);
    const chiBefore = await deadlineOf('chi');
    const anBefore = await deadlineOf('an');
    const res = await extend({ scope: 'all', minutes: 20, reason: 'Mất điện', batchId: batch() });
    expect(res.json()).toEqual({ extended: 2, skipped: 0 });
    expect(await deadlineOf('an')).toBe(anBefore + 20 * 60_000);
    expect(await deadlineOf('chi')).toBe(chiBefore);
    const scopes = await sql<{ scope: string }>(
      `select distinct scope from attempt_time_extensions`,
    );
    expect(scopes).toEqual([{ scope: 'all' }]);
  });

  it('trong danh sách có Lượt đã nộp thì bỏ qua và báo số bị bỏ qua', async () => {
    await takers.binh?.call('POST', `/take/attempts/${attemptIds.binh}/submit`);
    const res = await extend({
      attemptIds: [attemptIds.an, attemptIds.binh],
      minutes: 10,
      reason: 'x',
      batchId: batch(),
    });
    expect(res.json()).toEqual({ extended: 1, skipped: 1 });
  });

  it('Lượt không thuộc Phiên thi này bị coi là không tồn tại, không Lượt nào được cộng', async () => {
    const before = await deadlineOf('an');
    const res = await extend({
      attemptIds: [attemptIds.an, crypto.randomUUID()],
      minutes: 10,
      reason: 'x',
      batchId: batch(),
    });
    expect(res.statusCode).toBe(404);
    expect(await deadlineOf('an')).toBe(before);
  });
});

describe('thử lại cùng yêu cầu không cộng hai lần (Q262)', () => {
  it('gửi lại cùng mã lô trả kết quả lần đầu và hạn chỉ tăng một lần', async () => {
    const before = await deadlineOf('an');
    const body = { attemptIds: [attemptIds.an], minutes: 15, reason: 'Mất điện', batchId: batch() };
    const first = await extend(body);
    const again = await extend(body);
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect(await deadlineOf('an')).toBe(before + 15 * 60_000);
    expect(await sql(`select 1 from attempt_time_extensions`)).toHaveLength(1);
  });

  it('cả phòng gửi lại sau khi có người mới vào vẫn không cộng thêm cho người mới', async () => {
    const body = { scope: 'all', minutes: 10, reason: 'x', batchId: batch() };
    await extend(body);
    const dung = await Taker.signIn(t, 'dung');
    await dung.join('AB3K9X');
    const view = (await dung.call('POST', `/take/sessions/${sessionId}/start`)).json();
    const dungBefore = new Date(view.attempt.deadline).getTime();
    await extend(body);
    const after = (
      await sql<{ deadline: Date }>(`select deadline from attempts where id = $1`, [
        view.attempt.id,
      ])
    )[0]?.deadline.getTime();
    expect(after).toBe(dungBefore);
  });

  it('hai yêu cầu giống hệt gửi cùng lúc: hạn chỉ tăng một lần (S4)', async () => {
    const before = await deadlineOf('an');
    const body = { attemptIds: [attemptIds.an], minutes: 15, reason: 'x', batchId: batch() };
    const [a, b] = await Promise.all([extend(body), extend(body)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(await deadlineOf('an')).toBe(before + 15 * 60_000);
    expect(await sql(`select 1 from attempt_time_extensions`)).toHaveLength(1);
  });
});

describe('giới hạn và kiểm tra yêu cầu (Q256)', () => {
  it('tổng phần cộng thêm của một Lượt không quá 600 phút; vượt thì cả yêu cầu bị từ chối', async () => {
    for (let i = 0; i < 3; i++) {
      await extend({ attemptIds: [attemptIds.an], minutes: 180, reason: 'x', batchId: batch() });
    }
    await extend({ attemptIds: [attemptIds.an], minutes: 60, reason: 'x', batchId: batch() });
    const anBefore = await deadlineOf('an');
    const binhBefore = await deadlineOf('binh');
    const res = await extend({ scope: 'all', minutes: 1, reason: 'x', batchId: batch() });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'EXTENSION_LIMIT' });
    expect(await deadlineOf('an')).toBe(anBefore);
    expect(await deadlineOf('binh')).toBe(binhBefore);
  });

  it('số phút ngoài 1–180, thiếu lý do, hoặc không nói rõ ai thì báo lỗi dữ liệu', async () => {
    const ok = { attemptIds: [attemptIds.an], minutes: 15, reason: 'x', batchId: batch() };
    for (const bad of [
      { ...ok, minutes: 0 },
      { ...ok, minutes: 181 },
      { ...ok, reason: '  ' },
      { ...ok, scope: 'all' },
      { minutes: 15, reason: 'x', batchId: batch() },
    ]) {
      expect((await extend(bad)).statusCode).toBe(400);
    }
  });

  it('Phiên thi đã hủy thì không Cộng giờ; Phiên thi đã đóng Khung giờ vẫn Cộng được cho người đang làm', async () => {
    t.clock.set(new Date('2026-11-02T10:05:00+07:00'));
    const ok = await extend({ scope: 'all', minutes: 10, reason: 'x', batchId: batch() });
    expect(ok.statusCode, ok.body).toBe(200);
    await examinerApi('POST', `/sessions/${sessionId}/cancel`, {});
    const res = await extend({ scope: 'all', minutes: 10, reason: 'x', batchId: batch() });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('SESSION_CANCELLED');
  });
});

describe('quyền', () => {
  it('chỉ chủ Phiên thi: Người ra đề khác nhận 404, Người dự thi nhận 403', async () => {
    const body = { attemptIds: [attemptIds.an], minutes: 15, reason: 'x', batchId: batch() };
    expect((await extend(body, other)).statusCode).toBe(404);
    expect((await extend(body, takers.an?.cookie)).statusCode).toBe(403);
    expect(await sql(`select 1 from attempt_time_extensions`)).toHaveLength(0);
  });
});

describe('job quét tự nộp tôn trọng hạn đã kéo dài (S5)', () => {
  it('Lượt được Cộng giờ không bị nộp ở hạn cũ, chỉ bị nộp khi qua hạn mới cộng ân hạn', async () => {
    await extend({
      attemptIds: [attemptIds.an],
      minutes: 15,
      reason: 'Mất điện',
      batchId: batch(),
    });
    const sweep = t.app.get(AttemptSweepJob);
    t.clock.advance(minutes(46)); // quá hạn gốc 45 phút, còn trong hạn mới 60 phút
    expect(await sweep.run()).toBe(2); // chỉ Bình và Chi (không được Cộng giờ) bị nộp
    expect((await takers.an?.call('GET', `/take/attempts/${attemptIds.an}`))?.json().status).toBe(
      'in_progress',
    );
    t.clock.advance(minutes(14) + 31_000);
    expect(await sweep.run()).toBe(1);
    expect(await sql(`select 1 from attempts where submit_reason = 'timeout'`)).toHaveLength(3);
  });
});

describe('tranh chấp, dùng lại mã lô và Lượt chạm trần', () => {
  it('Cộng giờ xen Nộp bài: Lượt đã nộp không bị cộng và không có dòng nhật ký thừa (S4)', async () => {
    const before = await deadlineOf('an');
    const [submit, ext] = await Promise.all([
      takers.an?.call('POST', `/take/attempts/${attemptIds.an}/submit`),
      extend({ attemptIds: [attemptIds.an], minutes: 15, reason: 'x', batchId: batch() }),
    ]);
    expect(submit?.statusCode).toBe(200);
    expect(ext.statusCode).toBe(200);
    const rows = await sql(`select 1 from attempt_time_extensions`);
    // Hoặc Cộng giờ thắng (hạn đổi, 1 dòng), hoặc Nộp bài thắng (hạn giữ nguyên, không dòng nào, skipped=1).
    if (rows.length === 1) expect(await deadlineOf('an')).toBe(before + 15 * 60_000);
    else {
      expect(rows).toHaveLength(0);
      expect(ext.json()).toEqual({ extended: 0, skipped: 1 });
      expect(await deadlineOf('an')).toBe(before);
    }
  });

  it('dùng lại mã lô cho yêu cầu khác (số phút hay lý do khác) bị từ chối, không cộng gì', async () => {
    const id = batch();
    await extend({ attemptIds: [attemptIds.an], minutes: 15, reason: 'x', batchId: id });
    const after = await deadlineOf('an');
    const res = await extend({
      attemptIds: [attemptIds.an],
      minutes: 30,
      reason: 'x',
      batchId: id,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().reason).toBe('BATCH_REUSED');
    expect(await deadlineOf('an')).toBe(after);
  });

  it('vượt trần thì báo Lượt nào chạm trần để Người ra đề bỏ riêng Lượt đó', async () => {
    for (let i = 0; i < 4; i++) {
      await extend({
        attemptIds: [attemptIds.an],
        minutes: i < 3 ? 180 : 60,
        reason: 'x',
        batchId: batch(),
      });
    }
    const res = await extend({ scope: 'all', minutes: 1, reason: 'x', batchId: batch() });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ reason: 'EXTENSION_LIMIT', attemptIds: [attemptIds.an] });
  });

  it('nhật ký thao tác ghi rõ Lượt nào được cộng giờ', async () => {
    await extend({
      attemptIds: [attemptIds.an, attemptIds.binh],
      minutes: 5,
      reason: 'x',
      batchId: batch(),
    });
    const [row] = await sql<{ after: { attemptIds: string[] } }>(
      `select after from audit_logs where action = 'session.time_extended'`,
    );
    expect([...(row?.after.attemptIds ?? [])].sort()).toEqual(
      [attemptIds.an, attemptIds.binh].sort(),
    );
  });
});
