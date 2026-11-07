import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppealFinalizeService } from '../src/modules/grading/appeal-finalize.service';
import { AppealsService } from '../src/modules/grading/appeals.service';
import { AutogradeService } from '../src/modules/grading/autograde.service';
import { CandidateAppealsService } from '../src/modules/grading/candidate-appeals.service';
import { CandidateResultService } from '../src/modules/grading/candidate-result.service';
import { KeyCorrectionsService } from '../src/modules/grading/key-corrections.service';
import { ResultsExportService } from '../src/modules/grading/results-export.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import type { Taker } from './support/take';

// Đo thời gian chấm tự động (docs/plan/slice-5.md Q306, PR 5a). Chỉ chạy khi đặt GRADING_BENCH=1 (không chạy trong CI):
//   GRADING_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/grading-bench.int.test.ts
// Dựng 500 Lượt đã nộp bằng SQL rồi chấm theo lô 50 như job `grading.autograde` rồi in thời gian.

const N = 500;
const BATCH = 50;
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

describe.skipIf(!process.env.GRADING_BENCH)('đo chấm tự động', () => {
  it(`chấm ${N} Lượt trong dưới 10 giây, mỗi Lượt dưới 20 ms`, async () => {
    await resetState();
    const live = await openLiveSession(t, ['an']);
    const examiner = (await sql<{ id: string }>(`select id from users where username = 'gv1'`))[0]
      ?.id;
    await sql(
      `insert into users (id, username, full_name)
       select gen_random_uuid(), 'bench' || g, 'Bench ' || g from generate_series(1, ${N}) g`,
    );
    await sql(
      `insert into session_roster (session_id, user_id, added_by)
       select $1, id, $2 from users where username like 'bench%'`,
      [live.sessionId, examiner],
    );
    await sql(
      `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status)
       select gen_random_uuid(), $1, u.id, 1, 1, a.layout, now() - interval '30 min', now() + interval '15 min', 'in_progress'
       from users u, attempts a where u.username like 'bench%' and a.id = $2`,
      [live.sessionId, live.attemptIds.an],
    );
    await sql(
      `insert into responses (attempt_id, item_id, value, client_seq, saved_at)
       select a.id, ei.id, case q.type when 'single_choice' then '{"optionId":"o2"}'::jsonb
         when 'multiple_choice' then '{"optionIds":["o1","o3"]}'::jsonb
         when 'true_false_cluster' then '{"answers":{"s1":true,"s2":false}}'::jsonb
         else '{"text":"bài làm"}'::jsonb end, 1, now()
       from attempts a join exam_items ei on true join questions q on q.id = ei.question_id
       where a.id <> $1 and a.session_id = $2 and a.user_id in (select id from users where username like 'bench%')`,
      [live.attemptIds.an, live.sessionId],
    );
    // Nộp sau khi đã có Câu trả lời (trigger chỉ cho ghi Câu trả lời khi Lượt đang làm).
    await sql(
      `update attempts set status = 'submitted', submitted_at = now(), submit_reason = 'candidate'
       where session_id = $1 and status = 'in_progress' and user_id in (select id from users where username like 'bench%')`,
      [live.sessionId],
    );
    const ids = (
      await sql<{ id: string }>(
        `select id from attempts where user_id in (select id from users where username like 'bench%')`,
      )
    ).map((row) => row.id);
    expect(ids).toHaveLength(N);

    const service = t.app.get(AutogradeService, { strict: false });
    const started = performance.now();
    for (let i = 0; i < ids.length; i += BATCH)
      await service.gradeAttempts(ids.slice(i, i + BATCH));
    const total = performance.now() - started;
    // eslint-disable-next-line no-console
    console.log(
      `[đo] chấm ${N} Lượt: ${total.toFixed(0)} ms (${(total / N).toFixed(1)} ms mỗi Lượt)`,
    );
    expect(await sql(`select 1 from attempt_grades`)).toHaveLength(N);
    expect(total).toBeLessThan(10_000);

    // Màn Chấm và Kết quả với 500 Lượt (Q306, PR 5b): đo từng đường.
    const timed = async (
      label: string,
      run: () => Promise<{ statusCode: number }>,
      limitMs: number,
    ) => {
      const t0 = performance.now();
      const res = await run();
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`[đo] ${label}: ${ms.toFixed(0)} ms`);
      expect(res.statusCode).toBe(200);
      expect(ms).toBeLessThan(limitMs);
    };
    const get = (path: string) => () =>
      call(t.app, 'GET', `/api${path}`, { cookie: live.examiner });
    const base = `/sessions/${live.sessionId}`;
    const [essay] = (
      await call(t.app, 'GET', `/api${base}/grading/items`, { cookie: live.examiner })
    ).json().items as { itemId: string }[];
    await timed('bảng Kết quả 500 người', get(`${base}/results`), 500);
    await timed('hàng đợi chấm 500 bài', get(`${base}/grading/items/${essay?.itemId}/queue`), 300);
    const entries = (
      await call(t.app, 'GET', `/api${base}/grading/items/${essay?.itemId}/queue`, {
        cookie: live.examiner,
      })
    ).json().entries as { attemptId: string }[];
    await timed(
      'mở một bài tự luận',
      get(`${base}/grading/items/${essay?.itemId}/attempts/${entries[0]?.attemptId}`),
      300,
    );
    await timed(
      'lưu điểm một bài',
      () =>
        call(
          t.app,
          'PUT',
          `/api${base}/grading/attempts/${entries[0]?.attemptId}/items/${essay?.itemId}`,
          {
            cookie: live.examiner,
            body: { score: 0.5 },
          },
        ),
      150,
    );
    await timed('Thống kê câu', get(`${base}/results/item-stats`), 500);

    // Công bố, Kết quả của Người dự thi và xuất Excel với 500 người (Q306, PR 5c).
    const gv = (await sql<{ id: string }>(`select id from users where username = 'gv1'`))[0]
      ?.id as string;
    await sql(
      `update response_grades g set score = 0.5, source = 'manual', graded_by = $1, verdict = 'partial'
       from exam_items ei where ei.id = g.item_id and ei.snapshot->>'type' = 'essay' and g.score is null`,
      [gv],
    );
    await sql(`update session_gradings set blind = false where session_id = $1`, [
      live.sessionId,
    ]).catch(() => undefined);
    await (live.takers.an as Taker).call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    await call(t.app, 'POST', `/api${base}/close-entry`, { cookie: live.examiner });
    await timed(
      'Công bố 500 người',
      () =>
        call(t.app, 'POST', `/api${base}/release`, {
          cookie: live.examiner,
          body: { appealPeriodDays: 3 },
        }),
      1000,
    );
    const benchUser = (
      await sql<{ id: string }>(`select id from users where username = 'bench7'`)
    )[0]?.id as string;
    const t1 = performance.now();
    const mine = await t.app.get(CandidateResultService).result(benchUser, live.sessionId);
    const resultMs = performance.now() - t1;
    console.log(`[đo] Kết quả của Người dự thi: ${resultMs.toFixed(0)} ms`);
    expect(mine.items).toHaveLength(4);
    expect(resultMs).toBeLessThan(300);
    const t2 = performance.now();
    const book = await t.app.get(ResultsExportService).build(gv, live.sessionId);
    const exportMs = performance.now() - t2;
    console.log(
      `[đo] xuất Excel 500 người: ${exportMs.toFixed(0)} ms (${(book.file.length / 1024).toFixed(0)} KB)`,
    );
    expect(exportMs).toBeLessThan(1000);

    // Phúc khảo với 500 người (PR 5d-1): 150 người mỗi người 4 Phúc khảo = 600 Phúc khảo chờ (dựng bằng SQL; hạn mức 3 do service
    // kiểm, không phải cơ sở dữ liệu), rồi đo từng đường. Mọi đường chỉ đọc đúng Lượt liên quan, không nạp điểm cả Phiên thi.
    await sql(
      `insert into appeals (id, session_id, attempt_id, user_id, target, item_id, reason)
       select gen_random_uuid(), a.session_id, a.id, a.user_id, 'response', ei.id, 'Tôi nghĩ câu này chấm chưa đúng'
       from attempts a
       join users u on u.id = a.user_id and u.username ~ '^bench[0-9]+$' and substring(u.username from 6)::int <= 150
       join sessions s on s.id = a.session_id
       join exam_items ei on ei.exam_id = s.exam_id
       where a.session_id = $1`,
      [live.sessionId],
    );
    const timedCall = async <T>(label: string, run: () => Promise<T>, limitMs: number) => {
      const t0 = performance.now();
      const out = await run();
      const ms = performance.now() - t0;
      console.log(`[đo] ${label}: ${ms.toFixed(0)} ms`);
      expect(ms).toBeLessThan(limitMs);
      return out;
    };
    const examinerActor = { id: gv, ip: null };
    const appealsService = t.app.get(AppealsService);
    const list = await timedCall(
      'Phúc khảo: danh sách (500 dòng đầu của 600)',
      () => appealsService.list(gv, live.sessionId),
      300,
    );
    expect(list.items).toHaveLength(500);
    const openAppeal = list.items[0] as { id: string };
    await timedCall(
      'Phúc khảo: mở một Phúc khảo để xử lý',
      () => appealsService.detail(gv, live.sessionId, openAppeal.id),
      300,
    );
    await timedCall(
      'Phúc khảo: xử lý một Phúc khảo',
      () =>
        appealsService.resolve(examinerActor, live.sessionId, openAppeal.id, {
          response: 'Đã xem lại',
          score: 0.5,
        }),
      300,
    );
    const candidateAppeals = t.app.get(CandidateAppealsService);
    await timedCall(
      'Phúc khảo của tôi (Người dự thi có 4 Phúc khảo)',
      () => candidateAppeals.mine(benchUser, live.sessionId),
      300,
    );
    const fresh = (await sql<{ id: string }>(`select id from users where username = 'bench300'`))[0]
      ?.id as string;
    await timedCall(
      'Phúc khảo: Người dự thi gửi một Phúc khảo',
      () =>
        candidateAppeals.create({ id: fresh, ip: null }, live.sessionId, {
          target: 'response',
          no: 1,
          reason: 'Tôi nghĩ câu này chấm chưa đúng',
        }),
      300,
    );
    await timedCall('job Chốt: một lượt quét', () => t.app.get(AppealFinalizeService).sweep(), 100);

    // Đính chính với 5.000 Lượt (PR 5d-3a): thêm 9 Phiên thi cùng Bộ đề, mỗi Phiên thi 500 Lượt đã nộp (qua SQL), chấm tự động rồi
    // xem trước và chấm lại sau khi đổi đáp án câu chọn một từ o2 sang o1 (mọi Lượt bench đều chọn o2 nên đều giảm điểm).
    const examId = (
      await sql<{ exam_id: string }>(`select exam_id from sessions where id = $1`, [live.sessionId])
    )[0]?.exam_id as string;
    for (let k = 1; k <= 9; k++) {
      const extra = (
        await sql<{ id: string }>(
          `insert into sessions (id, exam_id, owner_id, title, opens_at, closes_at, duration_minutes, access_code)
           select gen_random_uuid(), exam_id, owner_id, 'Phien phu ' || $2::text, opens_at, closes_at, duration_minutes,
                  'ZB' || translate(lpad($2::text, 4, 'Z'), '01', 'AB')
           from sessions where id = $1 returning id`,
          [live.sessionId, String(k)],
        )
      )[0]?.id as string;
      await sql(
        `insert into session_roster (session_id, user_id, added_by)
         select $1, id, $2 from users where username like 'bench%'`,
        [extra, gv],
      );
      await sql(
        `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status)
         select gen_random_uuid(), $1, u.id, 1, 1, a.layout, now() - interval '30 min', now() + interval '15 min', 'in_progress'
         from users u, attempts a where u.username like 'bench%' and a.id = $2`,
        [extra, live.attemptIds.an],
      );
      await sql(
        `insert into responses (attempt_id, item_id, value, client_seq, saved_at)
         select a.id, ei.id, case q.type when 'single_choice' then '{"optionId":"o2"}'::jsonb
           when 'multiple_choice' then '{"optionIds":["o1","o3"]}'::jsonb
           when 'true_false_cluster' then '{"answers":{"s1":true,"s2":false}}'::jsonb
           else '{"text":"bài làm"}'::jsonb end, 1, now()
         from attempts a join exam_items ei on ei.exam_id = $2 join questions q on q.id = ei.question_id
         where a.session_id = $1 and a.user_id in (select id from users where username like 'bench%')`,
        [extra, examId],
      );
      await sql(
        `update attempts set status = 'submitted', submitted_at = now(), submit_reason = 'candidate'
         where session_id = $1 and status = 'in_progress'`,
        [extra],
      );
    }
    const extraAttempts = (
      await sql<{ id: string }>(
        `select a.id from attempts a join sessions s on s.id = a.session_id
         where s.title like 'Phien phu %' and a.status = 'submitted'`,
      )
    ).map((row) => row.id);
    expect(extraAttempts).toHaveLength(9 * N);
    const grader = t.app.get(AutogradeService, { strict: false });
    for (let i = 0; i < extraAttempts.length; i += BATCH) {
      await grader.gradeAttempts(extraAttempts.slice(i, i + BATCH));
    }
    const singleItem = (
      await sql<{ id: string }>(
        `select ei.id from exam_items ei where ei.exam_id = $1 and ei.snapshot->>'type' = 'single_choice'`,
        [examId],
      )
    )[0]?.id as string;
    const corrections = t.app.get(KeyCorrectionsService);
    const impact = await timedCall(
      'Đính chính: xem trước 5.000 Lượt',
      () => corrections.preview(gv, examId, singleItem, { newKey: ['o1'] }),
      3000,
    );
    expect(impact.attempts).toBeGreaterThanOrEqual(10 * N - 20);
    // Lượt `an` bỏ trống câu này nên không đổi; một dòng đã sửa qua Phúc khảo ở phần trên (nguồn `appeal`) được giữ nguyên.
    expect(impact.decrease).toBeGreaterThanOrEqual(10 * N - 1);
    const created = await timedCall(
      'Đính chính: xác nhận (trả lời ngay, chưa chấm lại)',
      () =>
        corrections.create(examinerActor, examId, singleItem, {
          newKey: ['o1'],
          reason: 'Nhập nhầm đáp án câu chọn một',
        }),
      300,
    );
    await timedCall(
      'Đính chính: chấm lại 5.000 Lượt ở nền (có 500 thông báo)',
      async () => {
        await t.queue.drain();
      },
      8000,
    );
    const progress = await corrections.progress(gv, examId, created.id);
    console.log(
      `[đo] Đính chính: ${progress.processed}/${progress.total} Lượt, giảm ${progress.decrease}, tăng ${progress.increase}`,
    );
    expect(progress.status).toBe('done');
    expect(progress.processed).toBe(progress.total);
  }, 180_000);
});
