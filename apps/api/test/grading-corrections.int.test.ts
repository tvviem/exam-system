import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD } from './support/users';

// S1–S5 (docs/plan/slice-5.md, PR 5d-3a): Đính chính đáp án, chấm lại ở nền, xem trước, các chặn và lớp bảo vệ. Bộ đề của
// `fullExam`: chọn một (đáp án o2), chọn nhiều (o1+o3), chùm (s1 đúng, s2 sai), tự luận; mỗi câu 1 điểm. An chọn đúng câu chọn
// một (o2), Bình chọn o1 (sai), Chi bỏ trống. Đính chính đáp án sang o1: An giảm, Bình tăng, Chi không đổi.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;
let items: Record<string, string>;
let examId: string;

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
  await answer('binh', { single_choice: { optionId: 'o1' }, essay: { text: 'Bài của Bình' } });
  for (const name of ['an', 'binh', 'chi']) {
    await (live.takers[name] as Taker).call(
      'POST',
      `/take/attempts/${live.attemptIds[name]}/submit`,
    );
  }
  await t.queue.drain();
  examId = (
    await sql<{ exam_id: string }>(`select exam_id from sessions where id = $1`, [live.sessionId])
  )[0]?.exam_id as string;
});

const api = (
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  who?: string,
) => call(t.app, method, `/api${path}`, { cookie: who ?? live.examiner, body });
const base = () => `/sessions/${live.sessionId}`;
const exam = () => `/exams/${examId}`;
const HOUR = 3_600_000;
const start = new Date('2026-11-02T10:30:00+07:00');
const finish = () => t.clock.set(start);
const gradeEssays = async () => {
  await api('GET', `${base()}/results`);
  for (const name of ['an', 'binh']) {
    await api('PUT', `${base()}/grading/attempts/${live.attemptIds[name]}/items/${items.essay}`, {
      score: 1,
    });
  }
};
const releaseNow = async (days = 3) => {
  finish();
  await gradeEssays();
  const res = await api('POST', `${base()}/release`, { appealPeriodDays: days });
  expect(res.statusCode, res.body).toBe(200);
};
const preview = (newKey: unknown, itemId = items.single_choice, who?: string) =>
  api('POST', `${exam()}/items/${itemId}/key-correction/preview`, { newKey }, who);
const correct = (
  newKey: unknown,
  reason = 'Nhập nhầm đáp án',
  itemId = items.single_choice,
  who?: string,
) => api('POST', `${exam()}/items/${itemId}/key-correction`, { newKey, reason }, who);
const scoreOf = async (name: string, type = 'single_choice') =>
  (
    await sql<{ score: string | null; source: string }>(
      `select score, source from response_grades where attempt_id = $1 and item_id = $2`,
      [live.attemptIds[name], items[type]],
    )
  )[0] as { score: string | null; source: string };
const gradingRow = async () =>
  (
    await sql<{ finalized_at: Date | null }>(
      `select finalized_at from session_gradings where session_id = $1`,
      [live.sessionId],
    )
  )[0] as { finalized_at: Date | null };
const relogin = async () => {
  live.examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  live.other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  for (const name of Object.keys(live.takers)) live.takers[name] = await Taker.signIn(t, name);
};
const correctionRow = async () =>
  (
    await sql<{ id: string; status: string; total_attempts: number; processed_attempts: number }>(
      `select id, status, total_attempts, processed_attempts from key_corrections order by corrected_at desc limit 1`,
    )
  )[0];

describe('Xem trước (Q316)', () => {
  it('đếm người tăng, giảm, không đổi; không ghi gì', async () => {
    const res = await preview(['o1']);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      attempts: 3,
      increase: 1,
      decrease: 1,
      unchanged: 1,
      openSessions: 1,
      finalizedSessions: 0,
      openAppeals: 0,
    });
    expect(await sql(`select 1 from key_corrections`)).toHaveLength(0);
    expect(Number((await scoreOf('an')).score)).toBe(1);
    expect(Number((await scoreOf('binh')).score)).toBe(0);
  });

  it('từ chối đáp án trùng, sai dạng, Phương án không có, câu tự luận', async () => {
    expect((await preview(['o2'])).json()).toMatchObject({ reason: 'KEY_UNCHANGED' });
    expect((await preview(['o2'])).statusCode).toBe(409);
    expect((await preview({ s1: true, s2: true })).statusCode).toBe(400); // sai dạng với chọn một
    expect((await preview(['o9'])).statusCode).toBe(400);
    expect((await preview(['o1', 'o2'])).statusCode).toBe(400); // chọn một cần đúng một
    expect((await preview(['o1'], items.essay)).statusCode).toBe(400);
    expect((await preview({ s1: true }, items.true_false_cluster)).statusCode).toBe(400); // thiếu Mệnh đề
    expect((await preview([])).statusCode).toBe(400);
  });

  it('chỉ chủ Bộ đề: người khác nhận 404', async () => {
    expect((await preview(['o1'], items.single_choice, live.other)).statusCode).toBe(404);
    expect(
      (await correct(['o1'], 'Nhập nhầm đáp án', items.single_choice, live.other)).statusCode,
    ).toBe(404);
    expect(
      (
        await api(
          'GET',
          `${exam()}/items/${items.single_choice}/key-corrections`,
          undefined,
          live.other,
        )
      ).statusCode,
    ).toBe(404);
  });
});

describe('Đính chính và chấm lại (Q302, Q319, Q320)', () => {
  it('đáp án mới có hiệu lực, chấm lại ở nền, vết trước và sau, nhật ký', async () => {
    const sent = await correct(['o1']);
    expect(sent.statusCode, sent.body).toBe(202);
    const id = sent.json().id as string;
    // Đang chạy: chưa chấm lại cho tới khi job chạy.
    expect((await api('GET', `${exam()}/key-corrections/${id}`)).json()).toMatchObject({
      status: 'running',
    });
    expect(Number((await scoreOf('an')).score)).toBe(1);
    await t.queue.drain();

    const done = (await api('GET', `${exam()}/key-corrections/${id}`)).json();
    expect(done).toMatchObject({
      status: 'done',
      total: 3,
      processed: 3,
      increase: 1,
      decrease: 1,
    });
    expect(await scoreOf('an')).toMatchObject({ source: 'correction' });
    expect(Number((await scoreOf('an')).score)).toBe(0);
    expect(Number((await scoreOf('binh')).score)).toBe(1);
    expect((await scoreOf('chi')).source).toBe('auto'); // không đổi: không ghi lại
    expect(await sql(`select 1 from key_correction_effects`)).toHaveLength(2);
    const audit = await sql(`select 1 from audit_logs where action = 'exam.key_corrected'`);
    expect(audit).toHaveLength(1);

    const history = (
      await api('GET', `${exam()}/items/${items.single_choice}/key-corrections`)
    ).json();
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ oldKey: ['o2'], newKey: ['o1'], correctedByMe: true });
  });

  it('Đính chính lại nhiều lần: lần mới nhất thắng, mỗi lần có vết (Q317)', async () => {
    await correct(['o1'], 'Sửa lần một nhầm');
    await t.queue.drain();
    expect((await correct(['o1'])).statusCode).toBe(409); // trùng đáp án hiệu lực
    const second = await correct(['o2'], 'Sửa lại về đáp án ban đầu');
    expect(second.statusCode, second.body).toBe(202);
    await t.queue.drain();
    expect(Number((await scoreOf('an')).score)).toBe(1);
    expect(Number((await scoreOf('binh')).score)).toBe(0);
    expect(await sql(`select 1 from key_corrections`)).toHaveLength(2);
    const history = (
      await api('GET', `${exam()}/items/${items.single_choice}/key-corrections`)
    ).json();
    expect(history.items.map((h: { newKey: string[] }) => h.newKey)).toEqual([['o2'], ['o1']]);
  });

  it('câu chùm: đáp án Đúng/Sai từng Mệnh đề', async () => {
    const sent = await correct(
      { s1: false, s2: false },
      'Mệnh đề a nhập sai',
      items.true_false_cluster,
    );
    expect(sent.statusCode, sent.body).toBe(202);
    await t.queue.drain();
    expect(Number((await scoreOf('an', 'true_false_cluster')).score)).toBeLessThan(1);
    expect((await scoreOf('an', 'true_false_cluster')).source).toBe('correction');
  });

  it('Lượt nộp sau Đính chính được chấm theo đáp án hiệu lực (Q320)', async () => {
    await correct(['o1']);
    await t.queue.drain();
    // Phiên thi mới dùng cùng Bộ đề: dựng bằng cách mở lại thêm một Lượt không có; thay bằng chấm lại trực tiếp một Lượt mới nộp.
    const dung = await Taker.signIn(t, 'dung');
    await dung.join('AB3K9X');
    const started = (await dung.call('POST', `/take/sessions/${live.sessionId}/start`)).json();
    const attemptId = started.attempt.id as string;
    await dung.call('PUT', `/take/attempts/${attemptId}/responses`, {
      items: [{ itemId: items.single_choice, value: { optionId: 'o1' }, clientSeq: 1 }],
    });
    await dung.call('POST', `/take/attempts/${attemptId}/submit`);
    await t.queue.drain();
    const row = (
      await sql<{ score: string }>(
        `select score from response_grades where attempt_id = $1 and item_id = $2`,
        [attemptId, items.single_choice],
      )
    )[0];
    expect(Number(row?.score)).toBe(1); // o1 nay là đáp án đúng
  });

  it('điểm chấm tay và điểm Phúc khảo giữ nguyên; chỉ báo Người dự thi đã Công bố mà điểm đổi', async () => {
    await releaseNow();
    // Bình Phúc khảo câu chọn một (sai), Người ra đề đặt 1 điểm: nguồn `appeal`.
    const binh = live.takers.binh as Taker;
    const no = (await binh.call('GET', `/take/sessions/${live.sessionId}/result`))
      .json()
      .items.find((i: { type: string }) => i.type === 'single_choice').no;
    expect(
      (
        await binh.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
          target: 'response',
          no,
          reason: 'Tôi nghĩ o1 cũng đúng',
        })
      ).statusCode,
    ).toBe(201);
    const appealId = (await api('GET', `${base()}/appeals`)).json().items[0].id as string;
    expect(
      (
        await api('POST', `${base()}/appeals/${appealId}/resolve`, {
          response: 'Chấp nhận',
          score: 0.5,
        })
      ).statusCode,
    ).toBe(200);

    expect((await correct(['o1'])).statusCode).toBe(202);
    await t.queue.drain();
    expect(await scoreOf('binh')).toMatchObject({ source: 'appeal' }); // giữ nguyên
    expect(Number((await scoreOf('binh')).score)).toBe(0.5);
    expect(Number((await scoreOf('an')).score)).toBe(0); // giảm
    const notes = await sql<{ user_id: string; data: { sessionId: string; no: number } }>(
      `select user_id, data from notifications where type = 'result.corrected'`,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]?.user_id).toBe(live.userIds.an);
    expect(notes[0]?.data.no).toBeGreaterThan(0);
  });

  it('Phiên thi chưa Công bố: chấm lại nhưng không báo ai', async () => {
    await correct(['o1']);
    await t.queue.drain();
    expect(await sql(`select 1 from notifications where type = 'result.corrected'`)).toHaveLength(
      0,
    );
    expect(Number((await scoreOf('an')).score)).toBe(0);
  });

  it('Phiên thi đã Chốt giữ nguyên điểm (Q302)', async () => {
    await releaseNow(1);
    t.clock.set(new Date(start.getTime() + 25 * HOUR));
    await relogin();
    await t.app.get(JobRegistry).run('grading.finalize', {});
    expect((await gradingRow()).finalized_at).not.toBeNull();
    const view = await preview(['o1']);
    expect(view.json()).toMatchObject({ attempts: 0, openSessions: 0, finalizedSessions: 1 });
    expect((await correct(['o1'])).statusCode).toBe(202);
    await t.queue.drain();
    expect(Number((await scoreOf('an')).score)).toBe(1);
    expect((await scoreOf('an')).source).toBe('auto');
    expect(await sql(`select 1 from notifications where type = 'result.corrected'`)).toHaveLength(
      0,
    );
  });

  it('Phúc khảo đang chờ về câu này được đếm khi xem trước', async () => {
    await releaseNow();
    const binh = live.takers.binh as Taker;
    const no = (await binh.call('GET', `/take/sessions/${live.sessionId}/result`))
      .json()
      .items.find((i: { type: string }) => i.type === 'single_choice').no;
    await binh.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
      target: 'response',
      no,
      reason: 'Tôi nghĩ o1 cũng đúng',
    });
    expect((await preview(['o1'])).json()).toMatchObject({ openAppeals: 1 });
  });

  it('Người dự thi không thấy đáp án dù sau Đính chính', async () => {
    await releaseNow();
    await correct(['o1']);
    await t.queue.drain();
    const body = (
      await (live.takers.an as Taker).call('GET', `/take/sessions/${live.sessionId}/result`)
    ).body;
    expect(body).not.toMatch(/"key"|key_correction|oldKey|newKey/);
  });
});

describe('Công bố và Chốt chờ chấm lại (Q319)', () => {
  it('đang chấm lại thì chưa Công bố được; xong thì Công bố được', async () => {
    finish();
    await gradeEssays();
    await correct(['o1']); // chưa drain: đang chạy
    const results = (await api('GET', `${base()}/results`)).json();
    expect(results.release.blockers).toContain('CORRECTION_RUNNING');
    expect(results.release.ready).toBe(false);
    const blocked = await api('POST', `${base()}/release`, { appealPeriodDays: 3 });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ reason: 'CORRECTION_RUNNING' });
    await t.queue.drain();
    expect((await api('POST', `${base()}/release`, { appealPeriodDays: 3 })).statusCode).toBe(200);
  });

  it('đang chấm lại thì job Chốt chờ, xong thì Chốt', async () => {
    await releaseNow(1);
    await correct(['o1']); // đang chạy
    t.clock.set(new Date(start.getTime() + 25 * HOUR));
    await relogin();
    await t.app.get(JobRegistry).run('grading.finalize', {});
    expect((await gradingRow()).finalized_at).toBeNull();
    await t.queue.drain();
    await t.app.get(JobRegistry).run('grading.finalize', {});
    expect((await gradingRow()).finalized_at).not.toBeNull();
  });
});

describe('Chạy lại khi lỗi và đồng thời (S4)', () => {
  it('Đính chính đang chạy thì từ chối Đính chính khác của cùng câu; hai yêu cầu cùng lúc chỉ một thắng', async () => {
    const [a, b] = await Promise.all([
      correct(['o1'], 'Sửa nhầm lần một'),
      correct(['o2', 'o3'].slice(0, 1), 'Sửa lần hai khác'),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    // Một bên 202; bên kia 409 (đang chạy) hoặc 409 (trùng đáp án hiệu lực).
    expect(codes[0]).toBe(202);
    expect(codes[1]).toBe(409);
    const again = await correct(['o3'], 'Lại sửa khi còn chạy');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ reason: 'CORRECTION_RUNNING' });
  });

  it('chấm lại lỗi thì Thử lại chạy nốt; chạy lại một Đính chính đã xong không đổi thêm gì', async () => {
    await correct(['o1']);
    const row = await correctionRow();
    // Giả lập job chết trước khi chạy: đặt `failed`; job xếp sẵn thấy không còn `running` nên bỏ qua.
    await sql(`update key_corrections set status = 'failed' where id = $1`, [row?.id]);
    await t.queue.drain();
    expect((await correctionRow())?.status).toBe('failed');
    expect(Number((await scoreOf('an')).score)).toBe(1); // chưa chấm lại

    expect((await api('POST', `${exam()}/key-corrections/${row?.id}/retry`)).statusCode).toBe(202);
    await t.queue.drain();
    expect((await correctionRow())?.status).toBe('done');
    expect(Number((await scoreOf('an')).score)).toBe(0);
    expect(await sql(`select 1 from key_correction_effects`)).toHaveLength(2);

    // Chạy lại job của Đính chính đã xong: bỏ qua, không thêm vết.
    await t.app.get(JobRegistry).run('grading.recorrect', { correctionId: row?.id as string });
    expect(await sql(`select 1 from key_correction_effects`)).toHaveLength(2);
    const nope = await api('POST', `${exam()}/key-corrections/${row?.id}/retry`);
    expect(nope.statusCode).toBe(409);
    expect(nope.json()).toMatchObject({ reason: 'NOT_FAILED' });
  });
});

describe('Lớp bảo vệ cơ sở dữ liệu (S3)', () => {
  it('điểm nguồn `correction` chỉ ghi khi đang chấm lại; vết chỉ ghi thêm; không xóa Đính chính', async () => {
    await expect(
      sql(
        `update response_grades set score = 0, source = 'correction', graded_by = $3
         where attempt_id = $1 and item_id = $2`,
        [live.attemptIds.an, items.single_choice, live.userIds.an],
      ),
    ).rejects.toThrow(/Dinh chinh/i);
    await correct(['o1']);
    await t.queue.drain();
    await expect(sql(`delete from key_correction_effects`)).rejects.toThrow(/them/i);
    await expect(sql(`update key_correction_effects set new_score = 9`)).rejects.toThrow(/them/i);
    await expect(sql(`delete from key_corrections`)).rejects.toThrow(/xoa/i);
    await expect(sql(`update key_corrections set reason = 'Lý do bị đổi mất rồi'`)).rejects.toThrow(
      /trang thai/i,
    );
    await expect(
      sql(`update key_corrections set status = 'running' where status = 'done'`),
    ).rejects.toThrow(/xong/i);
  });

  it('không chèn Đính chính cho câu tự luận hay câu của Bộ đề khác', async () => {
    await expect(
      sql(
        `insert into key_corrections (id, exam_id, item_id, old_key, new_key, reason, corrected_by)
         values (gen_random_uuid(), $1, $2, '["o1"]', '["o2"]', 'Lý do dài đủ mười ký tự', $3)`,
        [examId, items.essay, live.userIds.an],
      ),
    ).rejects.toThrow(/Cau/i);
  });
});
