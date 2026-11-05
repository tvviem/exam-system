import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedExam } from './support/exams';
import { login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S3 (Q273, Q275, Q280): lớp bảo vệ ở cơ sở dữ liệu cho Hoàn tác Buộc nộp (migration 0016). Lượt đã nộp chỉ mở lại được qua
// đúng một đường: lý do cũ là Buộc nộp (`examiner`) và có dòng nhật ký `attempt_reopenings` khớp với lần nộp và hạn mới.

let t: TestApp;
let ownerId: string;
let anId: string;
let sessionId: string;

const SUBMITTED_AT = '2026-12-01T01:30:00Z';
const DEADLINE = '2026-12-01T01:55:00Z';
const NEW_DEADLINE = '2026-12-01T01:58:00Z';

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await resetState();
  ownerId = (await seedUser({ username: 'gv1', roleTags: ['examiner'] })).id;
  anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  const examId = (await publishedExam(t, cookie)).id;
  const [row] = await sql<{ id: string }>(
    `insert into sessions (id, exam_id, owner_id, title, opens_at, closes_at, duration_minutes, access_code)
     values (gen_random_uuid(), $1, $2, 'Ca 1', '2026-12-01T01:00:00Z', '2026-12-01T03:00:00Z', 45, 'AB3K9X')
     returning id`,
    [examId, ownerId],
  );
  sessionId = (row as { id: string }).id;
  await sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
    sessionId,
    anId,
    ownerId,
  ]);
});

async function submittedAttempt(reason: string) {
  const [row] = await sql<{ id: string }>(
    `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status, submitted_at, submit_reason)
     values (gen_random_uuid(), $1, $2, 1, 1, '{"sections":[]}'::jsonb, '2026-12-01T01:10:00Z', $3, 'submitted', $4, $5::attempt_submit_reason)
     returning id`,
    [sessionId, anId, DEADLINE, SUBMITTED_AT, reason],
  );
  return (row as { id: string }).id;
}

const reopening = (attemptId: string, deadline = NEW_DEADLINE, submittedAt = SUBMITTED_AT) =>
  sql(
    `insert into attempt_reopenings (id, attempt_id, reopened_by, previous_submitted_at, new_deadline)
     values (gen_random_uuid(), $1, $2, $3, $4)`,
    [attemptId, ownerId, submittedAt, deadline],
  );
const reopen = (attemptId: string, deadline = NEW_DEADLINE) =>
  sql(
    `update attempts set status = 'in_progress', submitted_at = null, submit_reason = null, deadline = $2 where id = $1`,
    [attemptId, deadline],
  );
const row = async (attemptId: string) =>
  (
    await sql<{ status: string; submit_reason: string | null; deadline: Date }>(
      `select status, submit_reason, deadline from attempts where id = $1`,
      [attemptId],
    )
  )[0];

describe('mở lại Lượt đã nộp: chỉ qua đường Hoàn tác Buộc nộp', () => {
  it('đường hợp lệ: Buộc nộp + dòng nhật ký khớp lần nộp và hạn mới thì mở lại được', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id);
    await reopen(id);
    expect(await row(id)).toMatchObject({ status: 'in_progress', submit_reason: null });
    expect((await row(id))?.deadline.toISOString()).toBe('2026-12-01T01:58:00.000Z');
  });

  it('không có dòng nhật ký thì SQL trực tiếp cũng không mở lại được', async () => {
    const id = await submittedAttempt('examiner');
    await expect(reopen(id)).rejects.toThrow(/da nop/);
    expect(await row(id)).toMatchObject({ status: 'submitted' });
  });

  it.each(['candidate', 'timeout', 'disqualified', 'account_locked', 'session_cancelled'])(
    'lý do nộp %s thì không mở lại được dù có dòng nhật ký',
    async (reason) => {
      const id = await submittedAttempt(reason);
      await reopening(id);
      await expect(reopen(id)).rejects.toThrow(/da nop/);
      expect(await row(id)).toMatchObject({ status: 'submitted', submit_reason: reason });
    },
  );

  it('dòng nhật ký phải khớp hạn mới và lần nộp', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id, NEW_DEADLINE);
    await expect(reopen(id, '2026-12-01T02:30:00Z')).rejects.toThrow(/da nop/);
    expect(await row(id)).toMatchObject({ status: 'submitted' });
  });

  it('dòng nhật ký của lần nộp khác (khác thời điểm nộp) không dùng được', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id, NEW_DEADLINE, '2026-12-01T01:31:00Z');
    await expect(reopen(id)).rejects.toThrow(/da nop/);
  });

  it('mở lại không được đổi gì khác ngoài trạng thái và hạn (không đổi nội dung Lượt)', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id);
    await expect(
      sql(
        `update attempts set status = 'in_progress', submitted_at = null, submit_reason = null, deadline = $2, seed = 99 where id = $1`,
        [id, NEW_DEADLINE],
      ),
    ).rejects.toThrow();
    expect(await row(id)).toMatchObject({ status: 'submitted' });
  });

  it('hạn mới không được sớm hơn hạn cũ', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id, '2026-12-01T01:40:00Z');
    await expect(reopen(id, '2026-12-01T01:40:00Z')).rejects.toThrow();
  });

  it('một lần nộp chỉ hoàn tác một lần (nhật ký duy nhất theo Lượt và lần nộp)', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id);
    await expect(reopening(id, '2026-12-01T02:00:00Z')).rejects.toThrow();
  });

  it('người này đã có Lượt khác đang làm thì không mở lại Lượt cũ (chỉ mục một Lượt đang làm)', async () => {
    const id = await submittedAttempt('examiner');
    await sql(
      `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline)
       values (gen_random_uuid(), $1, $2, 2, 2, '{"sections":[]}'::jsonb, '2026-12-01T01:35:00Z', '2026-12-01T02:20:00Z')`,
      [sessionId, anId],
    );
    await reopening(id);
    await expect(reopen(id)).rejects.toThrow();
  });
});

describe('nhật ký attempt_reopenings chỉ ghi thêm', () => {
  it('không sửa, không xóa', async () => {
    const id = await submittedAttempt('examiner');
    await reopening(id);
    await expect(sql(`update attempt_reopenings set new_deadline = now()`)).rejects.toThrow();
    await expect(sql(`delete from attempt_reopenings`)).rejects.toThrow();
  });
});
