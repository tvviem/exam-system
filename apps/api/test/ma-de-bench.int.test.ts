import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedDrawExam } from './support/exams';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Đo thời gian của Mã đề (docs/plan/ma-de-phien-thi-thiet-ke.md mục 6, V5; ngân sách ở docs/architecture.md "Ngân sách phản hồi").
// Chỉ chạy khi đặt MA_DE_BENCH=1 (không chạy trong CI, như grading-bench):
//   MA_DE_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/ma-de-bench.int.test.ts
// Phiên thi 10 Mã đề từ Bộ đề 100 câu, Danh sách 500 người: lưu Phiên thi, thêm người, Chia lại, xuất zip.

const PEOPLE = 500;
const VARIANTS = 10;
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

/** Đo một lần gọi: trả kết quả và số mili giây. */
const timed = async <T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const start = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - start) };
};

describe.skipIf(!process.env.MA_DE_BENCH)(
  'đo Mã đề: 10 Mã đề, Bộ đề 100 câu, Danh sách 500 người',
  () => {
    it('lưu Phiên thi, thêm 500 người, Chia lại và xuất zip đều nhanh (thao tác thường dưới 1 giây, zip dưới 3 giây)', async () => {
      await resetState();
      t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
      await seedUser({ username: 'gv1', roleTags: ['examiner'] });
      const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
      const exam = await publishedDrawExam(t, cookie, [
        { points: Array(100).fill(1), drawPercent: 50 },
      ]);
      await sql(
        `insert into users (id, username, full_name, class_label, status, activated_at)
       select gen_random_uuid(), 'bench' || g, 'Bench ' || g, 'BENCH', 'active', now()
       from generate_series(1, ${PEOPLE}) g`,
      );
      await sql(
        `insert into user_role_tags (user_id, tag) select id, 'candidate' from users where username like 'bench%'`,
      );

      const create = await timed(() =>
        call(t.app, 'POST', '/api/sessions', {
          cookie,
          body: {
            examId: exam.id,
            title: 'Ca đo',
            opensAt: '2026-11-02T07:00:00+07:00',
            closesAt: '2026-11-02T10:00:00+07:00',
            durationMinutes: 45,
            accessCode: 'AB3K9X',
            drawScope: 'shared',
            variantCount: VARIANTS,
          },
        }),
      );
      expect(create.value.statusCode, create.value.body).toBe(201);
      const id = create.value.json().id as string;

      const add = await timed(() =>
        call(t.app, 'POST', `/api/sessions/${id}/roster`, {
          cookie,
          body: { classLabel: 'BENCH' },
        }),
      );
      expect(add.value.statusCode, add.value.body).toBe(200);
      expect(add.value.json().added).toBe(PEOPLE);

      const list = await timed(() =>
        call(t.app, 'GET', `/api/sessions/${id}/roster?pageSize=50`, { cookie }),
      );
      expect(list.value.statusCode).toBe(200);

      const rebalance = await timed(() =>
        call(t.app, 'POST', `/api/sessions/${id}/variants/rebalance`, { cookie, body: {} }),
      );
      expect(rebalance.value.statusCode, rebalance.value.body).toBe(200);

      const zip = await timed(() =>
        call(t.app, 'POST', '/api/paper/variants', {
          cookie,
          body: { sessionId: id, course: 'Tin học', answers: true, confirm: true },
        }),
      );
      expect(zip.value.statusCode, zip.value.body).toBe(200);

      const monitor = await timed(() =>
        call(t.app, 'GET', `/api/sessions/${id}/monitor`, { cookie }),
      );
      expect(monitor.value.statusCode).toBe(200);

      const rows = [
        ['lưu Phiên thi 10 Mã đề (Bộ đề 100 câu)', create.ms, 1000],
        [`thêm ${PEOPLE} người vào Danh sách (kèm chia Mã đề)`, add.ms, 1000],
        ['xem một trang Danh sách (50 người, có Mã đề)', list.ms, 300],
        [`Chia lại ${PEOPLE} người`, rebalance.ms, 1000],
        ['mở Theo dõi 500 người', monitor.ms, 1000],
        [
          `xuất zip 10 Mã đề (Đề + Đáp án + Excel), ${Math.round(zip.value.rawPayload.length / 1024)} KB`,
          zip.ms,
          3000,
        ],
      ] as const;
      const report = rows
        .map(([name, ms, limit]) => `${String(ms).padStart(6)} ms  ${name} (ngân sách ${limit} ms)`)
        .join('\n');
      process.stdout.write(`\n${report}\n`);
      if (process.env.MA_DE_BENCH_OUT) writeFileSync(process.env.MA_DE_BENCH_OUT, `${report}\n`);
      for (const [name, ms, limit] of rows) expect(ms, name).toBeLessThan(limit);
    }, 120_000);
  },
);
