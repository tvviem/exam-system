import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S1–S5 (docs/plan/slice-5.md, PR 5d-1): Phúc khảo hai phía, job Chốt, nhắc việc, gia hạn, các chặn của cơ sở dữ liệu. Bộ đề của
// `fullExam`: bốn câu 1 điểm (hạn mức Phúc khảo = 3). An chọn sai câu chọn một (o1; đáp án o2), đúng hai câu trắc nghiệm còn lại và được 0,5 điểm
// tự luận (2,5/4); Bình chỉ viết tự luận và được 1 điểm; Chi nộp bài trắng; Dũng không vào thi.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;
let items: Record<string, string>;

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
    single_choice: { optionId: 'o1' },
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
const HOUR = 3_600_000;
const start = new Date('2026-11-02T10:30:00+07:00'); // quá Khung giờ (đóng 10:00)
const finish = () => t.clock.set(start);
/** Tua giờ giả tới `hours` giờ sau lúc kết thúc; phiên đăng nhập cũ hết hạn nên đăng nhập lại mọi người. */
const after = async (hours: number) => {
  t.clock.set(new Date(start.getTime() + hours * HOUR));
  live.examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  live.other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  for (const name of Object.keys(live.takers)) live.takers[name] = await Taker.signIn(t, name);
};
const grade = (name: string, score: number) =>
  api('PUT', `${base()}/grading/attempts/${live.attemptIds[name]}/items/${items.essay}`, { score });
/** Chấm xong mọi tự luận rồi Công bố với hạn `days` ngày (0 = không nhận Phúc khảo). */
const releaseNow = async (days = 3) => {
  finish();
  await api('GET', `${base()}/results`);
  await grade('an', 0.5);
  await grade('binh', 1);
  const res = await api('POST', `${base()}/release`, { appealPeriodDays: days });
  expect(res.statusCode, res.body).toBe(200);
};
const mine = (name: string) =>
  (live.takers[name] as Taker).call('GET', `/take/sessions/${live.sessionId}/appeals`);
const result = async (name: string) =>
  (
    await (live.takers[name] as Taker).call('GET', `/take/sessions/${live.sessionId}/result`)
  ).json();
const noOf = async (name: string, type: string) =>
  (await result(name)).items.find((i: { type: string }) => i.type === type).no as number;
const REASON = 'Tôi nghĩ câu này chấm chưa đúng';
const appealCase = async (name: string, type: string, reason = REASON) =>
  (live.takers[name] as Taker).call('POST', `/take/sessions/${live.sessionId}/appeals`, {
    target: 'response',
    no: await noOf(name, type),
    reason,
  });
const appealsOf = async () => (await api('GET', `${base()}/appeals`)).json();
const resolveAppeal = (id: string, body: unknown, who?: string) =>
  api('POST', `${base()}/appeals/${id}/resolve`, body, who);
const runJob = (name: 'grading.finalize') => t.app.get(JobRegistry).run(name, {});
const userId = async (username: string) =>
  (await sql<{ id: string }>(`select id from users where username = $1`, [username]))[0]
    ?.id as string;
const gradingRow = async () =>
  (
    await sql<{
      finalized_at: Date | null;
      appeal_period_hours: number;
      appeal_reminded_at: Date | null;
    }>(
      `select finalized_at, appeal_period_hours, appeal_reminded_at from session_gradings where session_id = $1`,
      [live.sessionId],
    )
  )[0] as {
    finalized_at: Date | null;
    appeal_period_hours: number;
    appeal_reminded_at: Date | null;
  };
const staffNotes = async (type: string) =>
  sql<{ data: { count: number } }>(
    `select data from notifications where type = $1 and user_id = $2 order by created_at`,
    [type, await userId('gv1')],
  );

describe('Gửi Phúc khảo (Q300, Q311, Q312)', () => {
  it('Người dự thi gửi Phúc khảo một câu; hai bên thấy đúng, chuông Người ra đề gộp một dòng', async () => {
    await releaseNow();
    const sent = await appealCase('an', 'single_choice');
    expect(sent.statusCode, sent.body).toBe(201);
    const no = await noOf('an', 'single_choice');
    expect(sent.json()).toMatchObject({ limit: 3, used: 1, appeal: { target: 'response', no } });

    const list = (await mine('an')).json();
    expect(list).toMatchObject({ limit: 3, used: 1 });
    expect(list.appeals[0]).toMatchObject({ status: 'open', no, reason: REASON, response: null });
    expect(list.appealUntil).not.toBeNull();
    // Người dự thi không thấy đáp án.
    expect(JSON.stringify(list)).not.toMatch(/"key"|rubric|correct_key/);

    const asExaminer = await appealsOf();
    expect(asExaminer).toMatchObject({ open: 1, resolved: 0 });
    expect(asExaminer.items[0]).toMatchObject({
      status: 'open',
      target: 'response',
      reason: REASON,
    });
    expect(asExaminer.items[0].user.id).toBe(live.userIds.an);
    expect(asExaminer.items[0].no).toBeGreaterThan(0);

    const detail = (await api('GET', `${base()}/appeals/${list.appeals[0].id}`)).json();
    expect(detail.item.type).toBe('single_choice');
    expect(JSON.stringify(detail.item.payload)).toContain('key'); // Người ra đề được thấy đáp án
    expect(detail.answer).toEqual({ optionId: 'o1' });
    expect(detail.grade).toMatchObject({ score: 0, verdict: 'wrong', source: 'auto' });

    // Chuông: Bình gửi thêm thì vẫn một dòng, số cập nhật.
    expect((await appealCase('binh', 'essay')).statusCode).toBe(201);
    const notes = await staffNotes('appeal.new');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.data.count).toBe(2);
  });

  it('chưa Công bố: 409 NOT_RELEASED', async () => {
    finish();
    const res = await (live.takers.an as Taker).call(
      'POST',
      `/take/sessions/${live.sessionId}/appeals`,
      { target: 'response', no: 1, reason: REASON },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ reason: 'NOT_RELEASED' });
    expect((await mine('an')).statusCode).toBe(409);
  });

  it('hết hạn: 409 APPEAL_PERIOD_ENDED; không nhận Phúc khảo (đã Chốt ngay): ALREADY_FINALIZED', async () => {
    await releaseNow(1);
    await after(25);
    const late = await appealCase('an', 'single_choice');
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ reason: 'APPEAL_PERIOD_ENDED' });
  });

  it('mỗi đối tượng một lần, đủ hạn mức thì dừng, đối tượng không hợp lệ bị từ chối', async () => {
    await releaseNow();
    expect((await appealCase('an', 'single_choice')).statusCode).toBe(201);
    const again = await appealCase('an', 'single_choice');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ reason: 'ALREADY_APPEALED' });
    expect((await appealCase('an', 'multiple_choice')).statusCode).toBe(201);
    expect((await appealCase('an', 'true_false_cluster')).statusCode).toBe(201);
    const over = await appealCase('an', 'essay'); // câu thứ tư, hạn mức 3
    expect(over.statusCode).toBe(409);
    expect(over.json()).toMatchObject({ reason: 'APPEAL_LIMIT_REACHED', limit: 3 });

    const taker = live.takers.binh as Taker;
    const post = (body: unknown) =>
      taker.call('POST', `/take/sessions/${live.sessionId}/appeals`, body);
    expect((await post({ target: 'response', no: 99, reason: REASON })).statusCode).toBe(404);
    expect((await post({ target: 'response', no: 1, reason: 'ngắn' })).statusCode).toBe(400);
    expect(
      (
        await post({
          target: 'penalty',
          violationId: '0198f0aa-0000-7000-8000-000000000001',
          reason: REASON,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('người ngoài Danh sách và người không có Lượt nhận 404; Người ra đề khác nhận 404', async () => {
    await releaseNow();
    await seedUser({ username: 'ngoai', roleTags: ['candidate'] });
    const outsider = await Taker.signIn(t, 'ngoai');
    expect(
      (
        await outsider.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
          target: 'response',
          no: 1,
          reason: REASON,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await outsider.call('GET', `/take/sessions/${live.sessionId}/appeals`)).statusCode,
    ).toBe(404);
    const dung = await Taker.signIn(t, 'dung'); // trong Danh sách nhưng không có Lượt nào
    expect(
      (
        await dung.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
          target: 'response',
          no: 1,
          reason: REASON,
        })
      ).statusCode,
    ).toBe(404);
    expect((await api('GET', `${base()}/appeals`, undefined, live.other)).statusCode).toBe(404);
  });
});

describe('Xử lý Phúc khảo (Q300, Q310, Q313)', () => {
  it('đặt điểm mới: Kết quả của Người dự thi đổi, vết trước và sau, thông báo, không xử lý lần hai', async () => {
    await releaseNow();
    expect((await appealCase('an', 'single_choice')).statusCode).toBe(201);
    const before = (await result('an')).summary;
    expect(before.rawScore).toBe(2.5);
    const id = (await appealsOf()).items[0].id as string;

    const resolved = await resolveAppeal(id, {
      response: 'Đã xem lại, B cũng chấp nhận',
      score: 1,
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json()).toMatchObject({
      status: 'resolved',
      previousValue: { score: 0, verdict: 'wrong' },
      newValue: { score: 1, verdict: 'correct' },
    });
    const after = await result('an');
    expect(after.summary.rawScore).toBe(3.5);
    expect(after.items.find((i: { type: string }) => i.type === 'single_choice').verdict).toBe(
      'correct',
    );
    const row = (
      await sql<{ source: string; graded_by: string }>(
        `select source, graded_by from response_grades where attempt_id = $1 and item_id = $2`,
        [live.attemptIds.an, items.single_choice],
      )
    )[0];
    expect(row).toMatchObject({ source: 'appeal', graded_by: await userId('gv1') });

    const list = (await mine('an')).json();
    expect(list.appeals[0]).toMatchObject({
      status: 'resolved',
      response: 'Đã xem lại, B cũng chấp nhận',
      newValue: { score: 1 },
    });
    const notes = await sql<{ data: { appealId: string } }>(
      `select data from notifications where type = 'appeal.resolved' and user_id = $1`,
      [live.userIds.an],
    );
    expect(notes).toHaveLength(1);
    // Hết Phúc khảo chờ: dấu "Phúc khảo mới" của Người ra đề đã được đọc.
    const unread = await sql(
      `select 1 from notifications where type = 'appeal.new' and read_at is null`,
    );
    expect(unread).toHaveLength(0);

    const twice = await resolveAppeal(id, { response: 'Lại xử lý', score: 0 });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ reason: 'ALREADY_RESOLVED' });
  });

  it('Giữ điểm vẫn ghi nguồn Phúc khảo; điểm quá tối đa hoặc sai dạng bị từ chối; người được Ủy quyền xử lý được', async () => {
    await releaseNow();
    await appealCase('an', 'single_choice');
    const id = (await appealsOf()).items[0].id as string;
    expect((await resolveAppeal(id, { response: 'ok', score: 1.5 })).statusCode).toBe(400);
    expect(
      (await resolveAppeal(id, { response: 'ok', penalty: { type: 'none' } })).statusCode,
    ).toBe(400);
    expect((await resolveAppeal(id, { response: '   ', score: 0 })).statusCode).toBe(400);
    expect((await resolveAppeal(id, { response: 'ok', score: 0 }, live.other)).statusCode).toBe(
      404,
    );

    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    const kept = await resolveAppeal(id, { response: 'Giữ nguyên điểm', score: 0 }, live.other);
    expect(kept.statusCode, kept.body).toBe(200);
    expect(kept.json().newValue).toMatchObject({ score: 0, verdict: 'wrong' });
    const source = (
      await sql<{ source: string }>(
        `select source from response_grades where attempt_id = $1 and item_id = $2`,
        [live.attemptIds.an, items.single_choice],
      )
    )[0]?.source;
    expect(source).toBe('appeal');
  });

  it('Phúc khảo Mức xử lý: người dự thi gửi theo id Vi phạm, Người ra đề đổi Mức xử lý', async () => {
    await sql(
      `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
       values (gen_random_uuid(), $1, $2, $3, 'warning', 'Nhìn bài bạn', $4)`,
      [live.attemptIds.an, live.sessionId, live.userIds.an, await userId('gv1')],
    );
    await api('GET', `${base()}/results`);
    const violationId = (await api('GET', `${base()}/violations`)).json().items[0].id as string;
    expect(
      (
        await api('PUT', `${base()}/violations/${violationId}/penalty`, {
          type: 'percent',
          percent: 10,
        })
      ).statusCode,
    ).toBe(200);
    await releaseNow();

    const shown = await result('an');
    expect(shown.penalties[0]).toMatchObject({ id: violationId, type: 'percent', percent: 10 });
    const sent = await (live.takers.an as Taker).call(
      'POST',
      `/take/sessions/${live.sessionId}/appeals`,
      { target: 'penalty', violationId, reason: 'Tôi chỉ nhìn đồng hồ treo tường' },
    );
    expect(sent.statusCode, sent.body).toBe(201);
    expect(sent.json().appeal).toMatchObject({ target: 'penalty', no: null, violationId });

    const id = (await appealsOf()).items[0].id as string;
    const detail = (await api('GET', `${base()}/appeals/${id}`)).json();
    expect(detail.violation).toMatchObject({ reason: 'Nhìn bài bạn', penaltyType: 'percent' });
    const resolved = await resolveAppeal(id, {
      response: 'Đã xem lại băng ghi hình, bỏ Mức xử lý',
      penalty: { type: 'none' },
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json()).toMatchObject({
      previousValue: { type: 'percent', percent: 10 },
      newValue: { type: 'none' },
    });
    const final = await result('an');
    expect(final.summary.penaltyPercent).toBe(0);
    expect(final.summary.finalScore).toBe(2.5);
  });

  it('Mức xử lý "không xử lý" không có gì để Phúc khảo: 404', async () => {
    await sql(
      `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
       values (gen_random_uuid(), $1, $2, $3, 'warning', 'Nhắc nhở', $4)`,
      [live.attemptIds.an, live.sessionId, live.userIds.an, await userId('gv1')],
    );
    await api('GET', `${base()}/results`);
    const violationId = (await api('GET', `${base()}/violations`)).json().items[0].id as string;
    await api('PUT', `${base()}/violations/${violationId}/penalty`, { type: 'none' });
    await releaseNow();
    const sent = await (live.takers.an as Taker).call(
      'POST',
      `/take/sessions/${live.sessionId}/appeals`,
      { target: 'penalty', violationId, reason: REASON },
    );
    expect(sent.statusCode).toBe(404);
  });
});

describe('Chốt và nhắc việc (Q301, Q315)', () => {
  it('hết hạn mà không có Phúc khảo: job Chốt; chưa hết hạn thì chưa', async () => {
    await releaseNow(1);
    await after(23);
    await runJob('grading.finalize');
    expect((await gradingRow()).finalized_at).toBeNull();
    await after(25);
    await runJob('grading.finalize');
    const row = await gradingRow();
    expect(row.finalized_at).not.toBeNull();
    const results = (await api('GET', `${base()}/results`)).json();
    expect(results.release.finalizedAt).not.toBeNull();
    // Đã Chốt: không đổi điểm bằng đường nào (trigger).
    await expect(
      sql(`update response_grades set score = 1 where attempt_id = $1 and item_id = $2`, [
        live.attemptIds.an,
        items.single_choice,
      ]),
    ).rejects.toThrow(/chot/i);
  });

  it('còn Phúc khảo chờ thì không Chốt; nhắc lúc hết hạn rồi mỗi 24 giờ; xử lý xong Phúc khảo cuối thì Chốt ngay', async () => {
    await releaseNow(1);
    expect((await appealCase('an', 'single_choice')).statusCode).toBe(201);
    await after(25);
    await runJob('grading.finalize');
    expect((await gradingRow()).finalized_at).toBeNull();
    let notes = await staffNotes('appeal.overdue');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.data.count).toBe(1);

    await runJob('grading.finalize'); // cùng giờ: không nhắc lần hai
    expect(await staffNotes('appeal.overdue')).toHaveLength(1);
    const first = (await gradingRow()).appeal_reminded_at as Date;
    await after(50);
    await runJob('grading.finalize'); // 25 giờ sau: nhắc lại, vẫn gộp một dòng
    notes = await staffNotes('appeal.overdue');
    expect(notes).toHaveLength(1);
    expect(((await gradingRow()).appeal_reminded_at as Date).getTime()).toBeGreaterThan(
      first.getTime(),
    );

    // Sau hạn người dự thi không gửi mới được.
    const late = await appealCase('binh', 'essay');
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ reason: 'APPEAL_PERIOD_ENDED' });

    const id = (await appealsOf()).items[0].id as string;
    expect((await resolveAppeal(id, { response: 'Đã xem lại', score: 0 })).statusCode).toBe(200);
    expect((await gradingRow()).finalized_at).not.toBeNull(); // không chờ job
    // Xong việc nên không còn nhắc quá hạn chưa đọc.
    expect(
      await sql(`select 1 from notifications where type = 'appeal.overdue' and read_at is null`),
    ).toHaveLength(0);
  });

  it('không nhận Phúc khảo: Chốt ngay lúc Công bố, gửi Phúc khảo bị từ chối', async () => {
    await releaseNow(0);
    expect((await gradingRow()).finalized_at).not.toBeNull();
    const res = await appealCase('an', 'single_choice');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ reason: 'ALREADY_FINALIZED' });
  });
});

describe('Gia hạn Thời hạn phúc khảo (Q314)', () => {
  it('chỉ tăng, tối đa 14 ngày, báo Người dự thi; mở lại cửa gửi kể cả sau hạn khi chưa Chốt', async () => {
    await releaseNow(1);
    const extend = (days: number, who?: string) =>
      api('POST', `${base()}/appeal-period/extend`, { appealPeriodDays: days }, who);
    expect((await extend(1)).statusCode).toBe(409); // không tăng
    expect((await extend(2.5)).statusCode).toBe(400);
    expect((await extend(15)).statusCode).toBe(400);
    expect((await extend(3, live.other)).statusCode).toBe(404);

    await after(25); // đã quá hạn 1 ngày nhưng job chưa Chốt
    const ok = await extend(3);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(new Date(ok.json().appealUntil).getTime()).toBe(
      new Date(ok.json().releasedAt).getTime() + 72 * HOUR,
    );
    expect((await gradingRow()).appeal_period_hours).toBe(72);
    expect((await extend(2)).statusCode).toBe(409);
    const notes = await sql(`select 1 from notifications where type = 'appeal.period_extended'`);
    expect(notes).toHaveLength(3); // An, Bình, Chi đã có Lượt
    expect((await appealCase('an', 'single_choice')).statusCode).toBe(201);
    await runJob('grading.finalize');
    expect((await gradingRow()).finalized_at).toBeNull();
  });

  it('đã Chốt hoặc chưa Công bố: không gia hạn được', async () => {
    finish();
    expect(
      (await api('POST', `${base()}/appeal-period/extend`, { appealPeriodDays: 3 })).json(),
    ).toMatchObject({ reason: 'NOT_RELEASED' });
    await releaseNow(1);
    await after(25);
    await runJob('grading.finalize');
    const res = await api('POST', `${base()}/appeal-period/extend`, { appealPeriodDays: 3 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ reason: 'ALREADY_FINALIZED' });
  });
});

describe('Đồng thời (S4)', () => {
  it('bốn Phúc khảo cùng lúc của một người chỉ nhận đủ hạn mức 3', async () => {
    await releaseNow();
    const nos = await Promise.all(
      ['single_choice', 'multiple_choice', 'true_false_cluster', 'essay'].map((type) =>
        noOf('an', type),
      ),
    );
    const taker = live.takers.an as Taker;
    const results = await Promise.all(
      nos.map((no) =>
        taker.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
          target: 'response',
          no,
          reason: REASON,
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 201, 201, 409]);
    expect((await mine('an')).json().used).toBe(3);
  });

  it('hai người cùng xử lý một Phúc khảo: một bên thắng, bên kia 409', async () => {
    await releaseNow();
    await appealCase('an', 'single_choice');
    const id = (await appealsOf()).items[0].id as string;
    await api('PUT', `${base()}/grading-delegate`, { userId: await userId('gv2') });
    const [a, b] = await Promise.all([
      resolveAppeal(id, { response: 'Chủ xử lý', score: 1 }),
      resolveAppeal(id, { response: 'Người được Ủy quyền xử lý', score: 0 }, live.other),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const final = (await result('an')).items.find(
      (i: { type: string }) => i.type === 'single_choice',
    );
    const winner = a.statusCode === 200 ? 'correct' : 'wrong';
    expect(final.verdict).toBe(winner);
  });

  it('gia hạn và Chốt cùng lúc sau hạn: không bao giờ vừa Chốt vừa kéo dài', async () => {
    await releaseNow(1);
    await after(25);
    const [extended] = await Promise.all([
      api('POST', `${base()}/appeal-period/extend`, { appealPeriodDays: 3 }),
      runJob('grading.finalize'),
    ]);
    const row = await gradingRow();
    if (extended.statusCode === 200) {
      expect(row).toMatchObject({ appeal_period_hours: 72, finalized_at: null });
    } else {
      expect(extended.statusCode).toBe(409);
      expect(row.finalized_at).not.toBeNull();
      expect(row.appeal_period_hours).toBe(24);
    }
  });
});

describe('Lớp bảo vệ cơ sở dữ liệu (S3)', () => {
  it('Phúc khảo không chèn khi chưa Công bố, đã xử lý thì bất biến, không xóa được', async () => {
    const insert = () =>
      sql(
        `insert into appeals (id, session_id, attempt_id, user_id, target, item_id, reason)
         values (gen_random_uuid(), $1, $2, $3, 'response', $4, $5)`,
        [live.sessionId, live.attemptIds.an, live.userIds.an, items.single_choice, REASON],
      );
    await expect(insert()).rejects.toThrow(/cong bo/i);
    await releaseNow();
    await appealCase('an', 'single_choice');
    const id = (await appealsOf()).items[0].id as string;
    await resolveAppeal(id, { response: 'Đã xem lại', score: 1 });
    await expect(sql(`delete from appeals where id = $1`, [id])).rejects.toThrow(/xoa/i);
    await expect(
      sql(`update appeals set reason = 'Lý do khác nữa nhé' where id = $1`, [id]),
    ).rejects.toThrow();
    await expect(sql(`update appeals set response = 'đổi' where id = $1`, [id])).rejects.toThrow(
      /xu ly/i,
    );
  });

  it('điểm và Mức xử lý sau Công bố chỉ đổi khi có Phúc khảo đang mở', async () => {
    await releaseNow();
    await expect(
      sql(
        `update response_grades set score = 1, source = 'appeal', graded_by = $3
         where attempt_id = $1 and item_id = $2`,
        [live.attemptIds.an, items.single_choice, await userId('gv1')],
      ),
    ).rejects.toThrow(/Phuc khao/i);
    await expect(
      sql(
        `update response_grades set score = 1, source = 'manual', graded_by = $3
         where attempt_id = $1 and item_id = $2`,
        [live.attemptIds.an, items.essay, await userId('gv1')],
      ),
    ).rejects.toThrow(/Phuc khao/i);
  });

  it('gia hạn chỉ tăng ở cấp cơ sở dữ liệu; Công bố vẫn đặt một lần', async () => {
    await releaseNow(2);
    await expect(
      sql(`update session_gradings set appeal_period_hours = 24 where session_id = $1`, [
        live.sessionId,
      ]),
    ).rejects.toThrow(/gia han/i);
    await expect(
      sql(`update session_gradings set released_at = now() where session_id = $1`, [
        live.sessionId,
      ]),
    ).rejects.toThrow(/cong bo/i);
    await expect(
      sql(`update session_gradings set appeal_period_hours = 72 where session_id = $1`, [
        live.sessionId,
      ]),
    ).resolves.toBeDefined();
  });
});
