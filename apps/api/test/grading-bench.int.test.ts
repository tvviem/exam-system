import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutogradeService } from '../src/modules/grading/autograde.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';

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
  }, 60_000);
});
