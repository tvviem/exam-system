import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedExam } from './support/exams';
import { login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S3 (Q172, Q198, Q256, Q259, Q262): ghi thẳng vào ba bảng của migration 0014 để kiểm lớp bảo vệ ở cơ sở dữ liệu.

let t: TestApp;
let ownerId: string;
let anId: string;
let binhId: string;
let sessionId: string;
let attemptId: string;

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
  binhId = (await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] })).id;
  const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  const examId = (await publishedExam(t, cookie)).id;
  const [row] = await sql<{ id: string }>(
    `insert into sessions (id, exam_id, owner_id, title, opens_at, closes_at, duration_minutes, access_code)
     values (gen_random_uuid(), $1, $2, 'Ca 1', '2026-12-01T01:00:00Z', '2026-12-01T03:00:00Z', 45, 'AB3K9X')
     returning id`,
    [examId, ownerId],
  );
  sessionId = (row as { id: string }).id;
  for (const userId of [anId, binhId]) {
    await sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
      sessionId,
      userId,
      ownerId,
    ]);
  }
  attemptId = await attempt(anId);
});

async function attempt(userId: string, status: 'in_progress' | 'submitted' = 'in_progress') {
  const [row] = await sql<{ id: string }>(
    `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status, submitted_at, submit_reason)
     values (gen_random_uuid(), $1, $2, 1, 12345, '{"sections":[]}'::jsonb, '2026-12-01T01:10:00Z', '2026-12-01T01:55:00Z', $3,
       $4, $5) returning id`,
    [
      sessionId,
      userId,
      status,
      status === 'submitted' ? '2026-12-01T01:30:00Z' : null,
      status === 'submitted' ? 'candidate' : null,
    ],
  );
  return (row as { id: string }).id;
}

const event = (type: string, forAttempt: string | null = attemptId) =>
  sql(
    `insert into session_events (session_id, user_id, attempt_id, type, data)
     values ($1, $2, $3, $4, '{"n":1}'::jsonb)`,
    [sessionId, anId, forAttempt, type],
  );

const extension = (
  over: {
    attempt?: string;
    minutes?: number;
    reason?: string;
    batch?: string;
    scope?: string;
  } = {},
) =>
  sql(
    `insert into attempt_time_extensions (id, attempt_id, minutes, scope, reason, batch_id, extended_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
    [
      over.attempt ?? attemptId,
      over.minutes ?? 15,
      over.scope ?? 'one',
      over.reason ?? 'Mất điện',
      over.batch ?? crypto.randomUUID(),
      ownerId,
    ],
  );

const violation = (
  over: { action?: string; reason?: string; user?: string; session?: string } = {},
) =>
  sql(
    `insert into violations (id, attempt_id, session_id, user_id, action, reason, recorded_by)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6) returning id`,
    [
      attemptId,
      over.session ?? sessionId,
      over.user ?? anId,
      over.action ?? 'warning',
      over.reason ?? 'Nhìn bài bạn',
      ownerId,
    ],
  );

describe('session_events: chỉ ghi nhận (Q198)', () => {
  it('ghi được năm loại sự kiện; giờ lấy của server', async () => {
    for (const type of [
      'tab_hidden',
      'tab_visible',
      'went_offline',
      'back_online',
      'device_rejected',
    ]) {
      await event(type);
    }
    const rows = await sql<{ at: Date }>(`select at from session_events`);
    expect(rows).toHaveLength(5);
    expect(Math.abs(Date.now() - (rows[0] as { at: Date }).at.getTime())).toBeLessThan(60_000);
  });

  it('loại không có trong danh sách bị từ chối', async () => {
    await expect(event('cheating')).rejects.toThrow(/invalid input value for enum/);
  });

  it('device_rejected không cần Lượt (người bị từ chối chưa có Lượt)', async () => {
    await event('device_rejected', null);
  });

  it('cùng mã sự kiện của trình duyệt trong một Lượt chỉ ghi một lần; sự kiện không mã thì ghi bao nhiêu cũng được', async () => {
    const insert = (clientEventId: string | null) =>
      sql(
        `insert into session_events (session_id, user_id, attempt_id, type, client_event_id)
         values ($1, $2, $3, 'tab_hidden', $4)`,
        [sessionId, anId, attemptId, clientEventId],
      );
    const id = crypto.randomUUID();
    await insert(id);
    await expect(insert(id)).rejects.toThrow(/session_events_client_event_unique/);
    await insert(null);
    await insert(null);
  });

  it('chỉ ghi thêm: không sửa, không xóa', async () => {
    await event('tab_hidden');
    await expect(sql(`update session_events set type = 'tab_visible'`)).rejects.toThrow(
      /chi ghi them/,
    );
    await expect(sql(`delete from session_events`)).rejects.toThrow(/chi ghi them/);
  });
});

describe('attempt_time_extensions: nhật ký Cộng giờ (Q256, Q262)', () => {
  it('ghi được một dòng cho một Lượt đang làm', async () => {
    await extension();
    await extension({ minutes: 30, scope: 'group', batch: crypto.randomUUID() });
    await extension({ minutes: 5, scope: 'all', batch: crypto.randomUUID() });
    expect(await sql(`select 1 from attempt_time_extensions`)).toHaveLength(3);
  });

  it('số phút từ 1 đến 180', async () => {
    for (const minutes of [0, -1, 181]) {
      await expect(extension({ minutes })).rejects.toThrow(/attempt_time_extensions_minutes_check/);
    }
    await extension({ minutes: 180 });
  });

  it('lý do bắt buộc, tối đa 200 ký tự', async () => {
    await expect(extension({ reason: '' })).rejects.toThrow(/attempt_time_extensions_reason_check/);
    await expect(extension({ reason: 'x'.repeat(201) })).rejects.toThrow(
      /attempt_time_extensions_reason_check/,
    );
  });

  it('phạm vi chỉ là one, group hoặc all', async () => {
    await expect(extension({ scope: 'everyone' })).rejects.toThrow(/invalid input value for enum/);
  });

  it('cùng mã lô không cộng hai lần cho một Lượt, nhưng Lượt khác dùng chung mã lô được', async () => {
    const batch = crypto.randomUUID();
    await extension({ batch });
    await expect(extension({ batch })).rejects.toThrow(/attempt_time_extensions_batch_unique/);
    await extension({ attempt: await attempt(binhId), batch });
  });

  it('tổng phần cộng thêm của một Lượt không quá 600 phút', async () => {
    for (let i = 0; i < 3; i++) await extension({ minutes: 180 });
    await extension({ minutes: 60 });
    await expect(extension({ minutes: 1 })).rejects.toThrow(/vuot tran Cong gio/);
  });

  it('Lượt đã nộp thì không cộng giờ nữa', async () => {
    const done = await attempt(binhId, 'submitted');
    await expect(extension({ attempt: done })).rejects.toThrow(/da nop/);
  });

  it('chỉ ghi thêm: không sửa, không xóa', async () => {
    await extension();
    await expect(sql(`update attempt_time_extensions set minutes = 1`)).rejects.toThrow(
      /chi ghi them/,
    );
    await expect(sql(`delete from attempt_time_extensions`)).rejects.toThrow(/chi ghi them/);
  });
});

describe('violations: Vi phạm (Q259)', () => {
  it('ghi Cảnh cáo và Đình chỉ; hình phạt mặc định là không', async () => {
    await violation();
    await violation({ action: 'disqualify', reason: 'Dùng tài liệu' });
    const rows = await sql<{ penalty_type: string; penalty_percent: string | null }>(
      `select penalty_type, penalty_percent from violations`,
    );
    expect(rows.map((r) => r.penalty_type)).toEqual(['none', 'none']);
  });

  it('lý do bắt buộc, tối đa 500 ký tự; hành động chỉ warning hoặc disqualify', async () => {
    await expect(violation({ reason: '' })).rejects.toThrow(/violations_reason_check/);
    await expect(violation({ reason: 'x'.repeat(501) })).rejects.toThrow(/violations_reason_check/);
    await expect(violation({ action: 'ban' })).rejects.toThrow(/invalid input value for enum/);
  });

  it('Phiên thi và người phải khớp với Lượt', async () => {
    await expect(violation({ user: binhId })).rejects.toThrow(/khong khop Luot/);
  });

  it('không sửa hành động, lý do hay Lượt; chỉ được quyết hình phạt (lát cắt 5)', async () => {
    const [row] = await violation();
    const id = (row as { id: string }).id;
    await expect(
      sql(`update violations set action = 'disqualify' where id = $1`, [id]),
    ).rejects.toThrow(/khong sua duoc/);
    await expect(sql(`update violations set reason = 'khac' where id = $1`, [id])).rejects.toThrow(
      /khong sua duoc/,
    );
    await sql(
      `update violations set penalty_type = 'percent', penalty_percent = 10, penalty_decided_at = now() where id = $1`,
      [id],
    );
  });

  it('phạt theo phần trăm phải có số phần trăm từ 0 đến 100', async () => {
    const [row] = await violation();
    const id = (row as { id: string }).id;
    await expect(
      sql(`update violations set penalty_type = 'percent', penalty_percent = 150 where id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/violations_penalty_check/);
    await expect(
      sql(`update violations set penalty_type = 'percent' where id = $1`, [id]),
    ).rejects.toThrow(/violations_penalty_check/);
  });

  it('không xóa', async () => {
    await violation();
    await expect(sql(`delete from violations`)).rejects.toThrow(/khong xoa duoc/);
  });
});
