import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { seedUser } from './support/users';

// S1–S5 (docs/plan/slice-5.md, PR 5c-1): Công bố, Kết quả của Người dự thi, xuất Excel, các chặn sau Công bố. Bộ đề của `fullExam`:
// bốn câu 1 điểm. An làm đúng ba câu trắc nghiệm và viết tự luận; Bình viết tự luận; Chi nộp bài trắng; Dũng không vào thi.

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
const grade = (name: string, score: number | null, who?: string) =>
  api(
    'PUT',
    `${base()}/grading/attempts/${live.attemptIds[name]}/items/${items.essay}`,
    { score, feedback: name === 'an' ? 'Khá tốt' : undefined },
    who,
  );
const release = (appealPeriodDays = 3, who?: string) =>
  api('POST', `${base()}/release`, { appealPeriodDays }, who);
const finish = () => t.clock.set(new Date('2026-11-02T10:30:00+07:00')); // quá Khung giờ (đóng 10:00)
const gradeAll = async () => {
  await api('GET', `${base()}/results`); // chấm bù, nạp item
  await grade('an', 0.5);
  await grade('binh', 1);
};
const resultOf = (name: string) =>
  (live.takers[name] as Taker).call('GET', `/take/sessions/${live.sessionId}/result`);

describe('Điều kiện Công bố (Q298)', () => {
  it('chưa kết thúc và còn bài tự luận chờ chấm: 409 kèm mọi lý do', async () => {
    const res = await release();
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({
      reason: 'SESSION_NOT_FINISHED',
      blockers: ['SESSION_NOT_FINISHED', 'ESSAYS_PENDING'],
      pendingEssays: 2,
    });
  });

  it('đã kết thúc nhưng còn bài chờ chấm: ESSAYS_PENDING; chấm xong thì Công bố được', async () => {
    finish();
    expect((await release()).json()).toMatchObject({ reason: 'ESSAYS_PENDING', pendingEssays: 2 });
    await gradeAll();
    const res = await release(3);
    expect(res.statusCode, res.body).toBe(200);
    const [row] = await sql<{ hours: number; finalized: Date | null; by: string }>(
      `select appeal_period_hours as hours, finalized_at as finalized, released_by as by from session_gradings`,
    );
    expect(row).toMatchObject({ hours: 72, finalized: null });
    expect(res.json().appealUntil).toBeTruthy();
    expect(await sql(`select 1 from audit_logs where action = 'session.released'`)).toHaveLength(1);
  });

  it('đóng cửa vào thi (dù chưa hết Khung giờ) cũng là kết thúc khi không còn Lượt đang làm', async () => {
    await gradeAll();
    expect((await release()).json().reason).toBe('SESSION_NOT_FINISHED');
    expect((await api('POST', `${base()}/close-entry`)).statusCode).toBe(200);
    expect((await release()).statusCode).toBe(200);
  });

  it('không có Lượt nào: NO_ATTEMPTS; Phiên thi đã Hủy: SESSION_CANCELLED', async () => {
    await resetState();
    live = await openLiveSession(t, []);
    finish();
    expect((await release()).json().blockers).toContain('NO_ATTEMPTS');
    await api('POST', `${base()}/cancel`, {});
    expect((await release()).json().blockers).toContain('SESSION_CANCELLED');
  });

  it('Công bố hai lần: lần hai 409 ALREADY_RELEASED; hạn ngoài 0–14 ngày bị từ chối', async () => {
    finish();
    await gradeAll();
    for (const days of [-1, 15, 1.5]) expect((await release(days)).statusCode).toBe(400);
    expect((await release(0)).statusCode).toBe(200);
    const again = await release(3);
    expect(again.statusCode).toBe(409);
    expect(again.json().reason).toBe('ALREADY_RELEASED');
  });

  it('không nhận Phúc khảo (0 ngày): Chốt ngay', async () => {
    finish();
    await gradeAll();
    const res = await release(0);
    expect(res.json().appealUntil).toBeNull();
    expect(res.json().finalizedAt).toBeTruthy();
  });

  it('người được Ủy quyền Công bố được (Q307); Người ra đề khác nhận 404', async () => {
    finish();
    await gradeAll();
    expect((await release(3, live.other)).statusCode).toBe(404);
    const gv2 = (await sql<{ id: string }>(`select id from users where username = 'gv2'`))[0]?.id;
    await api('PUT', `${base()}/grading-delegate`, { userId: gv2 });
    expect((await release(3, live.other)).statusCode).toBe(200);
  });

  it('hai lần Công bố cùng lúc: đúng một lần thành công', async () => {
    finish();
    await gradeAll();
    const [a, b] = await Promise.all([release(3), release(3)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect(await sql(`select 1 from audit_logs where action = 'session.released'`)).toHaveLength(1);
  });

  it('Công bố xen chấm tay: không điểm tay nào được ghi sau lúc Công bố', async () => {
    finish();
    await api('GET', `${base()}/results`);
    await grade('an', 0.5);
    const [rel, save] = await Promise.all([release(3), grade('binh', 1)]);
    expect([200, 409]).toContain(rel.statusCode);
    expect([200, 409]).toContain(save.statusCode);
    // Không thể vừa Công bố thành công vừa còn bài chưa chấm; điểm tay luôn có trước lúc Công bố.
    const late = await sql(
      `select 1 from response_grades g join session_gradings s on s.released_at is not null
       where g.source = 'manual' and g.graded_at > s.released_at`,
    );
    expect(late).toHaveLength(0);
    if (rel.statusCode === 200) expect(save.statusCode).toBe(200);
  });
});

describe('Sau Công bố (Q299, Q294, Q297)', () => {
  beforeEach(async () => {
    finish();
    await gradeAll();
  });

  it('không lưu điểm tay, không đặt Mức xử lý, không đổi Chấm ẩn tên, không đổi xem lại đề, không Hủy Phiên thi', async () => {
    const violationId = '00000000-0000-4000-8000-0000000000aa';
    await sql(
      `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
       values ($1, $2, $3, $4, 'warning', 'Nhìn bài', $5)`,
      [violationId, live.attemptIds.an, live.sessionId, live.userIds.an, live.userIds.an],
    );
    expect((await release()).statusCode).toBe(200);
    const reason = (res: { json: () => { reason?: string } }) => res.json().reason;
    expect(reason(await grade('an', 0.25))).toBe('ALREADY_RELEASED');
    expect(
      reason(await api('PUT', `${base()}/violations/${violationId}/penalty`, { type: 'void' })),
    ).toBe('ALREADY_RELEASED');
    expect(reason(await api('PUT', `${base()}/grading/blind`, { blind: false }))).toBe(
      'ALREADY_RELEASED',
    );
    expect(reason(await api('PUT', `${base()}/grading/review`, { reviewAfterRelease: true }))).toBe(
      'ALREADY_RELEASED',
    );
    expect(reason(await api('POST', `${base()}/cancel`, {}))).toBe('SESSION_RELEASED');
  });

  it('trigger cơ sở dữ liệu: đặt Công bố hai lần, Chốt trước Công bố, ghi điểm tay sau Công bố, đổi điểm sau Chốt đều bị từ chối', async () => {
    await release(0); // Chốt ngay
    await expect(sql(`update session_gradings set released_at = now()`)).rejects.toThrow(/cong bo/);
    await expect(sql(`update session_gradings set finalized_at = null`)).rejects.toThrow(/chot/);
    await expect(sql(`delete from session_gradings`)).rejects.toThrow(/khong xoa/);
    await expect(
      sql(
        `update response_grades set score = 0.1, source = 'manual', graded_by = $2 where attempt_id = $1 and item_id = $3`,
        [live.attemptIds.an, live.userIds.an, items.essay],
      ),
    ).rejects.toThrow(/chot/);
  });

  it('trigger: Chốt khi chưa Công bố bị ràng buộc từ chối', async () => {
    await resetState();
    live = await openLiveSession(t, []);
    await sql(`insert into session_gradings (session_id) values ($1)`, [live.sessionId]);
    await expect(
      sql(`update session_gradings set finalized_at = now() where session_id = $1`, [
        live.sessionId,
      ]),
    ).rejects.toThrow();
  });
});

describe('Kết quả của Người dự thi (Q297)', () => {
  it('chưa Công bố: 409 NOT_RELEASED; người ngoài Danh sách hoặc chưa làm bài: 404; Người ra đề: bị chặn', async () => {
    expect((await resultOf('an')).json().reason).toBe('NOT_RELEASED');
    finish();
    await gradeAll();
    await release();
    const dung = await Taker.signIn(t, 'dung');
    expect((await dung.call('GET', `/take/sessions/${live.sessionId}/result`)).statusCode).toBe(
      404,
    );
    const outsider = await seedUser({ username: 'ngoai', roleTags: ['candidate'] });
    expect(outsider.id).toBeTruthy();
    const stranger = await Taker.signIn(t, 'ngoai');
    expect((await stranger.call('GET', `/take/sessions/${live.sessionId}/result`)).statusCode).toBe(
      404,
    );
    expect(
      (await api('GET', `/take/sessions/${live.sessionId}/result`)).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });

  it('điểm, kết luận từng câu, bài tự luận và nhận xét; không lộ đáp án, hướng dẫn chấm hay quy tắc chấm', async () => {
    finish();
    await gradeAll();
    await release();
    const res = await resultOf('an');
    expect(res.statusCode, res.body).toBe(200);
    const data = res.json();
    expect(data.summary).toMatchObject({
      rawScore: 3.5,
      maxScore: 4,
      scaledScore: 8.8,
      percent: 87.5,
      voided: false,
    });
    expect(data.items).toHaveLength(4);
    const byType = Object.fromEntries(data.items.map((i: { type: string }) => [i.type, i]));
    expect(byType.single_choice).toMatchObject({ verdict: 'correct', score: 1 });
    expect(byType.true_false_cluster.cluster).toEqual({ correct: 2, total: 2 });
    expect(byType.essay).toMatchObject({ verdict: 'partial', score: 0.5 });
    expect(byType.essay.essay).toEqual({ answer: 'Bài tự luận của An', feedback: 'Khá tốt' });
    expect(byType.single_choice.review).toBeUndefined(); // mặc định không xem lại đề
    const text = res.body;
    for (const secret of ['"key"', '"rubric"', '"ladder"', '"scoringRule"', 'optionId'])
      expect(text).not.toContain(secret);
  });

  it('Chi nộp bài trắng được 0 và "bỏ trống"; Bình có nhận xét trống', async () => {
    finish();
    await gradeAll();
    await release();
    const chi = (await resultOf('chi')).json();
    expect(chi.summary).toMatchObject({ rawScore: 0, scaledScore: 0, percent: 0 });
    expect(chi.items.every((i: { verdict: string }) => i.verdict === 'blank')).toBe(true);
  });

  it('bật xem lại đề: có nội dung câu và đáp án của chính họ nhưng vẫn không có đáp án đúng', async () => {
    finish();
    await gradeAll();
    expect(
      (await api('PUT', `${base()}/grading/review`, { reviewAfterRelease: true })).json(),
    ).toEqual({ reviewAfterRelease: true });
    await release();
    const res = await resultOf('an');
    const single = res.json().items.find((i: { type: string }) => i.type === 'single_choice');
    expect(single.review.stem).toBeTruthy();
    expect(single.review.payload.options).toHaveLength(3);
    expect(single.review.answer).toEqual({ optionId: 'o2' });
    for (const secret of ['"key"', '"rubric"', '"ladder"']) expect(res.body).not.toContain(secret);
  });

  it('Mức xử lý và lý do hiện cho Người dự thi; Hủy kết quả cho 0 %', async () => {
    finish();
    await gradeAll();
    const violationId = '00000000-0000-4000-8000-0000000000bb';
    await sql(
      `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
       values ($1, $2, $3, $4, 'warning', 'Nhìn bài bạn', $5)`,
      [violationId, live.attemptIds.an, live.sessionId, live.userIds.an, live.userIds.an],
    );
    await api('PUT', `${base()}/violations/${violationId}/penalty`, {
      type: 'percent',
      percent: 10,
    });
    await release();
    const data = (await resultOf('an')).json();
    expect(data.summary).toMatchObject({
      penaltyPercent: 10,
      finalScore: 3.15,
      scaledScore: 7.9,
      percent: 78.8,
    });
    expect(data.penalties).toEqual([
      { action: 'warning', reason: 'Nhìn bài bạn', type: 'percent', percent: 10 },
    ]);
  });

  it('"Phiên thi của tôi" báo đã có Kết quả và hạn Phúc khảo', async () => {
    const before = (await (live.takers.an as Taker).call('GET', '/take/sessions')).json().items[0];
    expect(before).toMatchObject({ resultReleased: false, resultAppealUntil: null });
    finish();
    await gradeAll();
    await release(3);
    const after = (await (live.takers.an as Taker).call('GET', '/take/sessions')).json().items[0];
    expect(after.resultReleased).toBe(true);
    expect(after.resultAppealUntil).toBeTruthy();
  });

  it('thông báo "Kết quả đã được Công bố" cho mọi người đã có Lượt, không cho Dũng', async () => {
    finish();
    await gradeAll();
    await release();
    const rows = await sql<{ user_id: string }>(
      `select user_id from notifications where type = 'results.released'`,
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual(
      [live.userIds.an, live.userIds.binh, live.userIds.chi].sort(),
    );
  });
});

describe('Hoàn tác Buộc nộp sau Công bố (Q296)', () => {
  it('Lượt bị Buộc nộp trong Phiên thi đã Công bố không Hoàn tác được: 409 ALREADY_GRADED', async () => {
    await resetState();
    live = await openLiveSession(t, ['an']);
    const forced = await api('POST', `${base()}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
    expect(forced.statusCode, forced.body).toBe(200);
    await t.queue.drain();
    await t.app.get(JobRegistry).run('grading.sweep', {});
    expect((await api('POST', `${base()}/close-entry`)).statusCode).toBe(200);
    const done = await release(3);
    expect(done.statusCode, done.body).toBe(200);
    const undo = await api(
      'POST',
      `${base()}/attempts/${live.attemptIds.an}/undo-force-submit`,
      {},
    );
    expect(undo.statusCode, undo.body).toBe(409);
    expect(undo.json().reason).toBe('ALREADY_GRADED');
    expect((await live.attemptRow('an')).status).toBe('submitted');
  });
});

describe('Nhiều Lượt và trigger sau Công bố', () => {
  it('nhiều Lượt: Kết quả theo Lượt được tính (highest) và ghi rõ lượt nào', async () => {
    await sql(`update sessions set max_attempts = 2 where id = $1`, [live.sessionId]);
    const an = live.takers.an as Taker;
    const second = (await an.call('POST', `/take/sessions/${live.sessionId}/start`)).json();
    await an.call('POST', `/take/attempts/${second.attempt.id}/submit`); // lượt 2 bỏ trống
    await t.queue.drain();
    finish();
    await gradeAll();
    await release();
    const data = (await resultOf('an')).json();
    expect(data.attemptCount).toBe(2);
    expect(data.countedAttemptNo).toBe(1);
    expect(data.summary.rawScore).toBe(3.5);
  });

  it('sau Công bố (chưa Chốt) trigger từ chối đổi điểm tay nhưng cho ghi lại giá trị cũ', async () => {
    finish();
    await gradeAll();
    await release(3);
    await expect(
      sql(
        `update response_grades set score = 0.1, source = 'manual', graded_by = $2 where attempt_id = $1 and item_id = $3`,
        [live.attemptIds.an, live.userIds.an, items.essay],
      ),
    ).rejects.toThrow(/cong bo/);
    await sql(
      `update response_grades set graded_at = now() where attempt_id = $1 and source = 'auto'`,
      [live.attemptIds.an],
    );
    await expect(
      sql(
        `update response_grades set score = 0.1 where attempt_id = $1 and source = 'auto' and item_id <> $2`,
        [live.attemptIds.an, items.essay],
      ),
    ).rejects.toThrow(/cong bo/);
  });
});

describe('Xuất Excel (Q304)', () => {
  const download = async (who?: string) => {
    const res = await call(t.app, 'GET', `/api${base()}/results.xlsx`, {
      cookie: who ?? live.examiner,
    });
    expect(res.statusCode, res.body).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    return { res, workbook };
  };
  const cells = (sheet: ExcelJS.Worksheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) =>
      rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? ''))),
    );
    return rows;
  };

  it('hai trang tính, thông tin chung ở đầu, Chưa Công bố, chống chèn công thức', async () => {
    await sql(`update users set full_name = '=HYPERLINK("x")' where id = $1`, [live.userIds.binh]);
    finish();
    await api('GET', `${base()}/results`);
    await grade('an', 0.5);
    const { res, workbook } = await download();
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/ket-qua-.*\.xlsx/);
    const summary = cells(workbook.getWorksheet('Tổng hợp') as ExcelJS.Worksheet);
    expect(summary[0]).toEqual(['Tên Phiên thi', 'Giữa kỳ - ca 1']);
    expect(summary[1]?.[0]).toBe('Ngày diễn ra');
    expect(summary[1]?.[1]).toBe('02/11/2026');
    expect(summary[2]).toEqual(['Thời gian làm bài', '45 phút']);
    expect(summary[3]).toEqual(['Tổng số câu', '4 câu']);
    const flat = summary.flat().join('|');
    expect(flat).toContain('Chưa Công bố');
    expect(flat).toContain("'=HYPERLINK"); // dấu nháy đứng trước
    expect(flat).toContain('chờ chấm');
    const detail = cells(workbook.getWorksheet('Chi tiết') as ExcelJS.Worksheet);
    expect(detail[0]).toEqual(['Mã định danh', 'Họ và tên', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4']);
  });

  it('Chấm ẩn tên còn che điểm tự luận thì trang Chi tiết cũng che; khung giờ nhiều ngày ghi khoảng ngày; mã định danh chống công thức', async () => {
    await sql(`update users set code = '=1+1' where id = $1`, [live.userIds.binh]);
    await sql(`update sessions set closes_at = closes_at + interval '1 day' where id = $1`, [
      live.sessionId,
    ]);
    await api('GET', `${base()}/results`);
    await grade('an', 0.5); // còn bài của Bình chờ chấm: đang che
    const { workbook } = await download();
    const summary = cells(workbook.getWorksheet('Tổng hợp') as ExcelJS.Worksheet);
    expect(summary[1]).toEqual(['Ngày diễn ra', '02/11/2026 – 03/11/2026']);
    const detail = cells(workbook.getWorksheet('Chi tiết') as ExcelJS.Worksheet);
    const an = detail.find((row) => row[0] === 'SV001') as string[];
    expect(an.slice(2)).toEqual(['1', '1', '1', 'đang ẩn']); // điểm tự luận bị che, trắc nghiệm vẫn hiện
    expect(detail.flat()).toContain("'=1+1");
  });

  it('sau Công bố không còn "Chưa Công bố"; điểm tự luận và trắc nghiệm đúng ở trang Chi tiết', async () => {
    finish();
    await gradeAll();
    await release();
    const { workbook } = await download();
    const flat = cells(workbook.getWorksheet('Tổng hợp') as ExcelJS.Worksheet)
      .flat()
      .join('|');
    expect(flat).not.toContain('Chưa Công bố');
    const detail = cells(workbook.getWorksheet('Chi tiết') as ExcelJS.Worksheet);
    const an = detail.find((row) => row[0] === 'SV001') as string[];
    expect(an.slice(2)).toEqual(['1', '1', '1', '0.5']);
  });

  it('chỉ chủ hoặc người được Ủy quyền tải được: người khác 404, Người dự thi bị chặn', async () => {
    expect(
      (await call(t.app, 'GET', `/api${base()}/results.xlsx`, { cookie: live.other })).statusCode,
    ).toBe(404);
    const an = live.takers.an as Taker;
    expect((await an.call('GET', `${base()}/results.xlsx`)).statusCode).toBeGreaterThanOrEqual(403);
  });
});
