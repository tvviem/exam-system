import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutogradeService } from '../src/modules/grading/autograde.service';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Đo thời gian vào thi khi rút câu (docs/plan/rut-cau-theo-phan-thiet-ke.md, R5; ngân sách ở docs/architecture.md). Chỉ chạy khi
// đặt RUT_CAU_BENCH=1 (không chạy trong CI):
//   RUT_CAU_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/rut-cau-bench.int.test.ts
// Bộ đề 100 câu (5 Phần × 20 câu). Phiên thi "đủ" lấy 100 câu (như trước khi có Rút câu), Phiên thi "rút" lấy 40 câu (40 %).

/** Số Người dự thi; đặt RUT_CAU_N=500 để đo quy mô lớn. */
const N = Number(process.env.RUT_CAU_N ?? 100);
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor((values.length * p) / 100))
  ] as number;

describe.skipIf(!process.env.RUT_CAU_BENCH)('đo vào thi khi rút câu', () => {
  it(`bắt đầu Lượt và đọc đề, một người và ${N} người cùng lúc, 100 câu đủ so với rút 40 %`, async () => {
    await resetState();
    t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
    const gv = await seedUser({ username: 'gv1', roleTags: ['examiner'] });
    const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    const exam = await publishedDrawExam(
      t,
      cookie,
      Array.from({ length: 5 }, () => ({ drawPercent: 40, points: Array(20).fill(1) })),
      'Bộ đề 100 câu',
    );
    await seedUser({ username: 'bn0', code: 'BN0', roleTags: ['candidate'] });
    await sql(
      `insert into users (id, username, code, full_name, password_hash, activated_at, must_change_password)
       select gen_random_uuid(), 'bn' || g, 'BN' || g, 'Bench ' || g, password_hash, now(), false
         from generate_series(1, ${N - 1}) g, users where username = 'bn0'`,
    );
    await sql(
      `insert into user_role_tags (user_id, tag) select id, 'candidate' from users
        where username like 'bn%' and username <> 'bn0'`,
    );
    const users = (await sql<{ id: string }>(`select id from users where username like 'bn%'`)).map(
      (r) => r.id,
    );
    expect(users).toHaveLength(N);

    const makeSession = async (code: string, sectionDraws?: unknown) => {
      const created = await call(t.app, 'POST', '/api/sessions', {
        cookie,
        body: {
          examId: exam.id,
          title: `Bench ${code}`,
          opensAt: '2026-11-02T07:00:00+07:00',
          closesAt: '2026-11-02T10:00:00+07:00',
          durationMinutes: 45,
          accessCode: code,
          ...(sectionDraws ? { sectionDraws } : {}),
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      const id = created.json().id as string;
      await sql(
        `insert into session_roster (session_id, user_id, added_by) select $1, id, $2 from users where username like 'bn%'`,
        [id, gv.id],
      );
      return { id, code };
    };
    const full = await makeSession(
      'BNFULL',
      exam.sectionIds.map((sectionId) => ({ sectionId, percent: 100 })),
    );
    const drawn = await makeSession('BNDRAW');

    const takers: Taker[] = [];
    for (let i = 0; i < N; i++) {
      // Mỗi người đăng nhập từ một địa chỉ riêng để không chạm giới hạn đăng nhập theo địa chỉ.
      const { res, cookie: sessionCookie } = await login(
        t.app,
        `bn${i}`,
        DEFAULT_PASSWORD,
        `10.1.${i >> 8}.${i & 255}`,
      );
      expect(res.statusCode, res.body).toBe(200);
      takers.push(new Taker(t, sessionCookie as string));
    }
    for (const taker of takers) {
      await taker.join(full.code);
      await taker.join(drawn.code);
    }

    const run = async (label: string, session: { id: string }) => {
      const timed = async (taker: Taker, method: 'POST' | 'GET', path: string) => {
        const started = performance.now();
        const res = await taker.call(method, path);
        const ms = performance.now() - started;
        expect(res.statusCode, res.body).toBe(200);
        return { ms, bytes: res.body.length, json: res.json() };
      };
      const single = await timed(takers[0] as Taker, 'POST', `/take/sessions/${session.id}/start`);
      const rest = await Promise.all(
        takers.slice(1).map((taker) => timed(taker, 'POST', `/take/sessions/${session.id}/start`)),
      );
      const starts = rest.map((r) => r.ms);
      const attemptId = single.json.attempt.id as string;
      const view = await timed(takers[0] as Taker, 'GET', `/take/attempts/${attemptId}`);
      // Một truy vấn lấy mã Lượt của mọi người (mỗi lần gọi `sql` mở một kết nối riêng, nên không gọi song song hàng trăm lần).
      const attemptOf = new Map(
        (
          await sql<{ id: string; username: string }>(
            `select a.id, u.username from attempts a join users u on u.id = a.user_id where a.session_id = $1`,
            [session.id],
          )
        ).map((row) => [row.username, row.id]),
      );
      const views = await Promise.all(
        takers
          .slice(1)
          .map((taker, index) =>
            timed(taker, 'GET', `/take/attempts/${attemptOf.get(`bn${index + 1}`)}`),
          ),
      );
      const items = single.json.sections.flatMap((s: { items: unknown[] }) => s.items).length;
      // Ghi thẳng ra stderr: bộ test chặn console.log của ứng dụng.
      process.stderr.write(
        `[${label}] câu mỗi người: ${items}; start 1 người ${single.ms.toFixed(0)} ms (${(single.bytes / 1024).toFixed(0)} KB), ` +
          `${N - 1} cùng lúc p50/p95 ${percentile(starts, 50).toFixed(0)}/${percentile(starts, 95).toFixed(0)} ms; ` +
          `view 1 người ${view.ms.toFixed(0)} ms, ${N - 1} cùng lúc p50/p95 ${percentile(
            views.map((v) => v.ms),
            50,
          ).toFixed(0)}/${percentile(
            views.map((v) => v.ms),
            95,
          ).toFixed(0)} ms\n`,
      );
      return { items, p95: percentile(starts, 95), single: single.ms };
    };
    const a = await run('đủ 100 câu', full);
    const b = await run('rút 40 %', drawn);
    expect(a.items).toBe(100);
    expect(b.items).toBe(40);
    // Ngân sách (docs/architecture.md): rút câu không làm vào thi chậm hơn đáng kể, và bắt đầu Lượt một người dưới 200 ms.
    expect(b.single).toBeLessThan(200);
    // So sánh p95 chỉ có nghĩa ở quy mô 100 người (ngân sách 100 người cùng lúc); quy mô lớn hơn chỉ đo và in ra.
    if (N <= 100) expect(b.p95).toBeLessThan(a.p95 * 1.5 + 100);

    // Chấm và Kết quả của Phiên thi rút câu: nộp hết bằng SQL, chấm theo lô 50 như job `grading.autograde`, rồi đọc bảng Kết quả
    // và xuất Excel (mỗi người 40 câu của bộ câu riêng).
    await sql(
      `update attempts set status = 'submitted', submitted_at = now(), submit_reason = 'candidate'
        where session_id = $1 and status = 'in_progress'`,
      [drawn.id],
    );
    const attemptIds = (
      await sql<{ id: string }>(`select id from attempts where session_id = $1`, [drawn.id])
    ).map((row) => row.id);
    const grader = t.app.get(AutogradeService, { strict: false });
    const gradeStart = performance.now();
    for (let i = 0; i < attemptIds.length; i += 50)
      await grader.gradeAttempts(attemptIds.slice(i, i + 50));
    const gradeMs = performance.now() - gradeStart;
    const resultsStart = performance.now();
    const results = await call(t.app, 'GET', `/api/sessions/${drawn.id}/results`, { cookie });
    const resultsMs = performance.now() - resultsStart;
    expect(results.statusCode, results.body).toBe(200);
    const exportStart = performance.now();
    const xlsx = await call(t.app, 'GET', `/api/sessions/${drawn.id}/results.xlsx`, { cookie });
    const exportMs = performance.now() - exportStart;
    expect(xlsx.statusCode).toBe(200);
    process.stderr.write(
      `[chấm và Kết quả, ${N} người × 40 câu] chấm ${gradeMs.toFixed(0)} ms (${(gradeMs / N).toFixed(1)} ms mỗi Lượt); ` +
        `bảng Kết quả ${resultsMs.toFixed(0)} ms; xuất Excel ${exportMs.toFixed(0)} ms (${(((xlsx.rawPayload as Buffer | undefined)?.length ?? 0) / 1024) | 0} KB)\n`,
    );
    expect(results.json().session).toMatchObject({ totalItems: 40, maxScore: 40 });
  }, 1_800_000);
});
