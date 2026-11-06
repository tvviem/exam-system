import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AutogradeService } from '../src/modules/grading/autograde.service';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import type { Taker } from './support/take';

// S2/S3/S4 (docs/plan/slice-5.md, PR 5a): chấm tự động qua HTTP + PostgreSQL thật. Bộ đề của `fullExam`: mỗi câu 1 điểm: chọn một (đáp án o2),
// chọn nhiều (tỷ lệ, đáp án o1+o3), chùm 2 Mệnh đề (bậc thang [0, 0,25, 1], s1 đúng, s2 sai), tự luận.

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

const run = (name: 'grading.sweep' | 'attempt.sweep') => t.app.get(JobRegistry).run(name, {});

interface GradeRow {
  type: string;
  score: string | null;
  source: string;
}
const gradesOf = (name: string) =>
  sql<GradeRow>(
    `select q.type, g.score, g.source
     from response_grades g
     join exam_items ei on ei.id = g.item_id
     join questions q on q.id = ei.question_id
     where g.attempt_id = $1
     order by ei.sort`,
    [live.attemptIds[name]],
  );
const scoreByType = async (name: string) =>
  Object.fromEntries((await gradesOf(name)).map((row) => [row.type, row.score]));
const graded = async (name: string) =>
  (await sql(`select 1 from attempt_grades where attempt_id = $1`, [live.attemptIds[name]])).length;

async function answer(name: string, values: Record<string, unknown>) {
  const taker = live.takers[name] as Taker;
  const id = live.attemptIds[name];
  const view = (await taker.call('GET', `/take/attempts/${id}`)).json();
  const itemOf = (type: string) =>
    view.sections[0].items.find((i: { type: string }) => i.type === type).itemId as string;
  const saved = await taker.call('PUT', `/take/attempts/${id}/responses`, {
    items: Object.entries(values).map(([type, value]) => ({
      itemId: itemOf(type),
      value,
      clientSeq: 1,
    })),
  });
  expect(saved.statusCode, saved.body).toBe(200);
}
const submit = (name: string) =>
  (live.takers[name] as Taker).call('POST', `/take/attempts/${live.attemptIds[name]}/submit`);

describe('Chấm tự động sau khi nộp (Q286, Q287)', () => {
  it('nộp bài → job chấm → đủ điểm từng câu; tự luận có chữ chờ chấm tay', async () => {
    await answer('an', {
      single_choice: { optionId: 'o2' },
      multiple_choice: { optionIds: ['o1', 'o2'] },
      true_false_cluster: { answers: { s1: true } },
      essay: { text: 'Giới hạn là…' },
    });
    expect((await submit('an')).statusCode).toBe(200);
    expect(await graded('an')).toBe(0); // chấm ở nền, chưa chạy job
    await t.queue.drain();
    expect(await graded('an')).toBe(1);
    // chọn nhiều: đúng o1, thừa o2 → (1 − 1) / 2 = 0; chùm: chỉ s1 đúng, s2 bỏ trống = không đúng → ladder[1] = 0,25
    expect(await scoreByType('an')).toEqual({
      single_choice: '1.00',
      multiple_choice: '0.00',
      true_false_cluster: '0.25',
      essay: null,
    });
    expect((await gradesOf('an')).every((row) => row.source === 'auto')).toBe(true);
  });

  it('mọi câu của Bộ đề đều có dòng điểm, kể cả câu không trả lời; tự luận trống được 0', async () => {
    await submit('binh');
    await t.queue.drain();
    expect(await scoreByType('binh')).toEqual({
      single_choice: '0.00',
      multiple_choice: '0.00',
      true_false_cluster: '0.00',
      essay: '0.00',
    });
  });

  it('chọn nhiều tỷ lệ chọn thiếu một đáp án đúng được nửa điểm', async () => {
    await answer('chi', {
      single_choice: { optionId: 'o2' },
      multiple_choice: { optionIds: ['o1'] }, // 1/2 × 1 = 0,50
      true_false_cluster: { answers: { s1: true, s2: false } },
      essay: { text: '   ' },
    });
    await submit('chi');
    await t.queue.drain();
    expect(await scoreByType('chi')).toEqual({
      single_choice: '1.00',
      multiple_choice: '0.50',
      true_false_cluster: '1.00',
      essay: '0.00',
    });
  });

  it('chạy chấm hai lần cho cùng kết quả và không sinh dòng trùng', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    await submit('an');
    await t.queue.drain();
    const before = await gradesOf('an');
    const service = t.app.get(AutogradeService, { strict: false });
    expect(await service.gradeAttempts([live.attemptIds.an as string])).toBe(0); // đã chấm
    await run('grading.sweep');
    expect(await gradesOf('an')).toEqual(before);
    expect(await sql(`select 1 from attempt_grades`)).toHaveLength(1);
  });

  it('không ghi đè điểm khác `auto` khi chấm lại', async () => {
    await submit('an');
    await t.queue.drain();
    const [item] = await sql<{ item_id: string }>(
      `select item_id from response_grades g join exam_items ei on ei.id = g.item_id
       join questions q on q.id = ei.question_id where g.attempt_id = $1 and q.type = 'essay'`,
      [live.attemptIds.an],
    );
    const [gv] = await sql<{ id: string }>(`select id from users where username = 'gv1'`);
    await sql(
      `update response_grades set score = 0.75, source = 'manual', graded_by = $2 where attempt_id = $1 and item_id = $3`,
      [live.attemptIds.an, gv?.id, item?.item_id],
    );
    await sql(`delete from attempt_grades where attempt_id = $1`, [live.attemptIds.an]);
    await run('grading.sweep');
    expect((await scoreByType('an')).essay).toBe('0.75');
    expect(await graded('an')).toBe(1);
  });
});

describe('Các đường nộp khác đều được chấm (job quét)', () => {
  it('Buộc nộp cả phòng: mọi Lượt được chấm sau một lần quét', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    const res = await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      scope: 'all',
    });
    expect(res.statusCode, res.body).toBe(200);
    await run('grading.sweep');
    for (const name of ['an', 'binh', 'chi']) expect(await graded(name)).toBe(1);
    expect((await scoreByType('an')).single_choice).toBe('1.00');
  });

  it('Buộc nộp báo job chấm sau commit: chấm ngay không cần chờ job quét', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, { scope: 'all' });
    await t.queue.drain();
    for (const name of ['an', 'binh', 'chi']) expect(await graded(name)).toBe(1);
  });

  it('Đình chỉ nộp Lượt ngay và báo job chấm; Cảnh cáo thì chưa nộp nên chưa chấm', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    const warn = await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.binh}/violations`,
      { action: 'warning', reason: 'Nhìn bài bạn' },
    );
    expect(warn.statusCode, warn.body).toBe(201);
    const suspend = await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      { action: 'disqualify', reason: 'Dùng tài liệu' },
    );
    expect(suspend.statusCode, suspend.body).toBe(201);
    await t.queue.drain();
    expect(await graded('an')).toBe(1);
    expect((await scoreByType('an')).single_choice).toBe('1.00');
    expect(await graded('binh')).toBe(0);
  });

  it('Hủy Phiên thi báo job chấm sau commit', async () => {
    await answer('binh', { single_choice: { optionId: 'o2' } });
    await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    await t.queue.drain();
    expect((await scoreByType('binh')).single_choice).toBe('1.00');
  });

  it('Lượt nộp 20 phút trước (ngoài lần quét nhanh) được lần quét sâu bắt', async () => {
    await submit('an');
    t.queue.discard();
    t.clock.advance(minutes(20));
    await run('grading.sweep'); // lần đầu sau 60 giây là lần quét sâu
    expect(await graded('an')).toBe(1);
  });

  it('hết giờ: job tự nộp báo job chấm, Lượt được chấm', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    t.clock.advance(minutes(45) + 60_000); // quá hạn 08:45 và ân hạn
    await run('attempt.sweep');
    await t.queue.drain();
    for (const name of ['an', 'binh', 'chi']) expect(await graded(name)).toBe(1);
    expect((await live.attemptRow('an')).status).toBe('submitted');
    expect((await scoreByType('an')).single_choice).toBe('1.00');
  });

  it('Hủy Phiên thi: các Lượt đang làm bị nộp và được chấm phần đã lưu', async () => {
    await answer('binh', { single_choice: { optionId: 'o2' } });
    const res = await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    expect(res.statusCode, res.body).toBe(200);
    await run('grading.sweep');
    expect((await scoreByType('binh')).single_choice).toBe('1.00');
  });

  it('Lượt nộp ngoài cửa sổ 24 giờ không được job quét chấm', async () => {
    await submit('an');
    t.queue.discard(); // mất tin báo
    t.clock.advance(25 * 3_600_000);
    await run('grading.sweep');
    expect(await graded('an')).toBe(0);
  });

  it('mất hàng đợi: job quét chấm bù trong vài giây', async () => {
    t.queue.failNextEnqueue = true;
    await submit('an');
    await t.queue.drain();
    expect(await graded('an')).toBe(0);
    await run('grading.sweep');
    expect(await graded('an')).toBe(1);
  });
});

describe('Hoàn tác Buộc nộp và điểm (Q296)', () => {
  const forceAn = () =>
    live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
  const undoAn = () =>
    live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/undo-force-submit`,
      {},
    );

  it('điểm tự động không cản Hoàn tác; Hoàn tác xóa điểm cũ, nộp lại thì chấm lại', async () => {
    await answer('an', { single_choice: { optionId: 'o2' } });
    await forceAn();
    await run('grading.sweep');
    expect(await graded('an')).toBe(1);

    t.clock.advance(minutes(2));
    const undone = await undoAn();
    expect(undone.statusCode, undone.body).toBe(200);
    expect(await graded('an')).toBe(0);
    expect(
      await sql(`select 1 from response_grades where attempt_id = $1`, [live.attemptIds.an]),
    ).toHaveLength(0);

    // đổi câu trả lời rồi nộp lại: chấm theo bài mới
    await answer('an', { single_choice: { optionId: 'o1' } });
    // clientSeq 1 đã dùng nên câu cũ không bị ghi đè; thêm câu mới để thấy chấm lại
    await answer('an', { multiple_choice: { optionIds: ['o1', 'o3'] } });
    await submit('an');
    await t.queue.drain();
    expect(await graded('an')).toBe(1);
    expect((await scoreByType('an')).multiple_choice).toBe('1.00');
  });

  it('đã có điểm chấm tay thì Hoàn tác bị chặn (409 ALREADY_GRADED), Lượt giữ nguyên', async () => {
    await answer('an', { essay: { text: 'Bài làm' } });
    await forceAn();
    await run('grading.sweep');
    const [gv] = await sql<{ id: string }>(`select id from users where username = 'gv1'`);
    await sql(
      `update response_grades g set score = 0.5, source = 'manual', graded_by = $2
       from exam_items ei join questions q on q.id = ei.question_id
       where g.item_id = ei.id and g.attempt_id = $1 and q.type = 'essay'`,
      [live.attemptIds.an, gv?.id],
    );
    const res = await undoAn();
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().reason).toBe('ALREADY_GRADED');
    expect((await live.attemptRow('an')).status).toBe('submitted');
    expect(await graded('an')).toBe(1);
  });

  it('Hoàn tác cả lô: Lượt đã chấm tay bị bỏ qua, các Lượt còn lại mở lại', async () => {
    await answer('an', { essay: { text: 'Bài làm' } });
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, { scope: 'all' });
    await run('grading.sweep');
    const [gv] = await sql<{ id: string }>(`select id from users where username = 'gv1'`);
    await sql(
      `update response_grades g set score = 0.5, source = 'manual', graded_by = $2
       from exam_items ei join questions q on q.id = ei.question_id
       where g.item_id = ei.id and g.attempt_id = $1 and q.type = 'essay'`,
      [live.attemptIds.an, gv?.id],
    );
    const res = await live.api('POST', `/sessions/${live.sessionId}/undo-force-submit`, {});
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as {
      reopened: number;
      skipped: { attemptId: string; problem: string }[];
    };
    expect(body.reopened).toBe(2);
    expect(body.skipped).toEqual([{ attemptId: live.attemptIds.an, problem: 'ALREADY_GRADED' }]);
    expect(await graded('binh')).toBe(0);
    expect(await graded('an')).toBe(1);
  });
});

describe('Trigger của bảng điểm (S3)', () => {
  it('từ chối ghi điểm khi Lượt còn đang làm, điểm vượt tối đa hoặc âm, tự luận chấm tay thiếu người chấm', async () => {
    const [item] = await sql<{ id: string }>(
      `select ei.id from exam_items ei join questions q on q.id = ei.question_id where q.type = 'single_choice'`,
    );
    const insert = (
      score: string,
      attemptId = live.attemptIds.an,
      source = 'auto',
      by: string | null = null,
    ) =>
      sql(
        `insert into response_grades (attempt_id, item_id, score, source, graded_by) values ($1, $2, $3, $4::response_grade_source, $5)`,
        [attemptId, item?.id, score, source, by],
      );
    // Lượt còn đang làm
    await expect(insert('1')).rejects.toThrow(/chua nop/);
    await submit('an');
    await expect(insert('1.01')).rejects.toThrow(/vuot diem toi da/);
    await expect(insert('-0.5')).rejects.toThrow();
    await expect(insert('1', live.attemptIds.an, 'manual')).rejects.toThrow(
      /response_grades_manual_has_grader/,
    );
    await insert('1'); // hợp lệ
    await expect(
      sql(`insert into attempt_grades (attempt_id) values ($1)`, [live.attemptIds.binh]),
    ).rejects.toThrow(/chua nop/);
  });

  it('không ghi điểm cho câu không thuộc Bộ đề của Phiên thi', async () => {
    await submit('an');
    await expect(
      sql(
        `insert into response_grades (attempt_id, item_id, score, source) values ($1, gen_random_uuid(), 0, 'auto')`,
        [live.attemptIds.an],
      ),
    ).rejects.toThrow();
  });
});

describe('Đồng thời (S4)', () => {
  it('hai lần chấm cùng lúc một lô không sinh dòng trùng hay lỗi', async () => {
    for (const name of ['an', 'binh', 'chi']) await submit(name);
    t.queue.discard();
    const service = t.app.get(AutogradeService, { strict: false });
    const ids = Object.values(live.attemptIds);
    await Promise.all([service.gradeAttempts(ids), service.gradeAttempts(ids)]);
    expect(await sql(`select 1 from attempt_grades`)).toHaveLength(3);
    expect(await sql(`select 1 from response_grades`)).toHaveLength(12);
  });
});
