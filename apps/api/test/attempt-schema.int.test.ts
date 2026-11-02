import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { publishedExam } from './support/exams';
import { login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S3 (Q217, Q228, Q234): ghi thẳng vào bảng để kiểm lớp bảo vệ thứ hai ở cơ sở dữ liệu, không đi qua service.

let t: TestApp;
let ownerId: string;
let anId: string;
let binhId: string;
let examId: string;
let itemIds: string[];
let sessionId: string;

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
  examId = (await publishedExam(t, cookie)).id;
  itemIds = (
    await sql<{ id: string }>(`select id from exam_items where exam_id = $1 order by sort`, [
      examId,
    ])
  ).map((row) => row.id);
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
});

const device = (userId: string, hash: string, status = 'active') =>
  sql(
    `insert into session_devices (id, session_id, user_id, device_hash, status)
     values (gen_random_uuid(), $1, $2, $3, $4)`,
    [sessionId, userId, hash, status],
  );

async function attempt(
  userId: string,
  over: { no?: number; status?: 'in_progress' | 'submitted' } = {},
) {
  const status = over.status ?? 'in_progress';
  const [row] = await sql<{ id: string }>(
    `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status, submitted_at, submit_reason)
     values (gen_random_uuid(), $1, $2, $3, 12345, '{"sections":[]}'::jsonb, '2026-12-01T01:10:00Z', '2026-12-01T01:55:00Z', $4,
       $5, $6) returning id`,
    [
      sessionId,
      userId,
      over.no ?? 1,
      status,
      status === 'submitted' ? '2026-12-01T01:30:00Z' : null,
      status === 'submitted' ? 'candidate' : null,
    ],
  );
  return (row as { id: string }).id;
}

const respond = (attemptId: string, itemId: string, seq = 1) =>
  sql(
    `insert into responses (attempt_id, item_id, value, client_seq, saved_at)
     values ($1, $2, '{"optionId":"o1"}'::jsonb, $3, now())`,
    [attemptId, itemId, seq],
  );

describe('Thiết bị dự thi (ADR-0007, Q209)', () => {
  it('mỗi người chỉ có một thiết bị đang gắn', async () => {
    await device(anId, 'hash-a');
    await expect(device(anId, 'hash-b')).rejects.toThrow(/session_devices_one_active_per_user/);
  });

  it('một thiết bị chỉ phục vụ một người trong một Phiên thi', async () => {
    await device(anId, 'hash-a');
    await expect(device(binhId, 'hash-a')).rejects.toThrow(/session_devices_one_user_per_device/);
  });

  it('thiết bị đã bị thu hồi không chiếm chỗ: người đó gắn thiết bị mới, thiết bị cũ không sang người khác được', async () => {
    await device(anId, 'hash-a', 'revoked');
    await device(anId, 'hash-b');
    await device(binhId, 'hash-a'); // dòng revoked của An không chặn, vì chỉ dòng active bị ràng buộc
  });

  it('cùng người, cùng thiết bị chỉ một dòng (kể cả đã thu hồi)', async () => {
    await device(anId, 'hash-a', 'revoked');
    await expect(device(anId, 'hash-a')).rejects.toThrow(/session_devices_triple_unique/);
  });

  it('bớt người khỏi Danh sách (chưa có Lượt) thì dòng gắn thiết bị đi theo', async () => {
    await device(anId, 'hash-a');
    await sql(`delete from session_roster where session_id = $1 and user_id = $2`, [
      sessionId,
      anId,
    ]);
    expect(await sql(`select 1 from session_devices where user_id = $1`, [anId])).toHaveLength(0);
  });

  it('chỉ gắn cho người có trong Danh sách', async () => {
    const outsider = (await seedUser({ username: 'ngoai', roleTags: ['candidate'] })).id;
    await expect(device(outsider, 'hash-x')).rejects.toThrow(/violates foreign key constraint/);
  });
});

describe('Lượt làm bài: ràng buộc', () => {
  it('mỗi người chỉ có một Lượt đang làm, nhưng làm thêm Lượt khi Lượt trước đã nộp', async () => {
    await attempt(anId, { no: 1 });
    await expect(attempt(anId, { no: 2 })).rejects.toThrow(/attempts_one_in_progress/);
    await sql(`delete from responses`);
    const done = await attempt(binhId, { no: 1, status: 'submitted' });
    expect(done).toBeTruthy();
    await attempt(binhId, { no: 2 });
  });

  it('số thứ tự Lượt không trùng', async () => {
    await attempt(anId, { no: 1, status: 'submitted' });
    await expect(attempt(anId, { no: 1 })).rejects.toThrow(/attempts_session_user_no_unique/);
  });

  it('trạng thái đã nộp phải kèm giờ nộp và lý do', async () => {
    await expect(
      sql(
        `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline, status)
         values (gen_random_uuid(), $1, $2, 1, 1, '{}'::jsonb, '2026-12-01T01:10:00Z', '2026-12-01T01:55:00Z', 'submitted')`,
        [sessionId, anId],
      ),
    ).rejects.toThrow(/attempts_submitted_check/);
  });

  it('hạn phải sau giờ bắt đầu', async () => {
    await expect(
      sql(
        `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline)
         values (gen_random_uuid(), $1, $2, 1, 1, '{}'::jsonb, '2026-12-01T01:10:00Z', '2026-12-01T01:10:00Z')`,
        [sessionId, anId],
      ),
    ).rejects.toThrow(/attempts_deadline_check/);
  });

  it('người có Lượt không bị bớt khỏi Danh sách, và Phiên thi có Lượt không xóa được', async () => {
    await attempt(anId);
    await expect(
      sql(`delete from session_roster where session_id = $1 and user_id = $2`, [sessionId, anId]),
    ).rejects.toThrow(/violates foreign key constraint/);
    await expect(sql(`delete from sessions where id = $1`, [sessionId])).rejects.toThrow();
  });
});

describe('Lượt làm bài: trigger bất biến (Q217)', () => {
  it('không đổi nội dung đã tạo: Phiên thi, người, số thứ tự, hạt giống, bố cục, giờ bắt đầu', async () => {
    const id = await attempt(anId);
    for (const change of [
      `seed = 999`,
      `layout = '{"sections":[1]}'::jsonb`,
      `attempt_no = 5`,
      `started_at = '2026-12-01T01:00:00Z'`,
      `user_id = '${binhId}'`,
    ]) {
      await expect(sql(`update attempts set ${change} where id = $1`, [id])).rejects.toThrow(
        /khong doi duoc sau khi tao/,
      );
    }
  });

  it('hạn chỉ được kéo dài, không rút ngắn (Cộng giờ)', async () => {
    const id = await attempt(anId);
    await sql(`update attempts set deadline = deadline + interval '10 minutes' where id = $1`, [
      id,
    ]);
    await expect(
      sql(`update attempts set deadline = deadline - interval '20 minutes' where id = $1`, [id]),
    ).rejects.toThrow(/chi duoc keo dai/);
  });

  it('nộp bài được một lần; đã nộp thì không sửa gì nữa, kể cả hạn', async () => {
    const id = await attempt(anId);
    await sql(
      `update attempts set status = 'submitted', submitted_at = now(), submit_reason = 'timeout' where id = $1`,
      [id],
    );
    await expect(
      sql(`update attempts set submit_reason = 'examiner' where id = $1`, [id]),
    ).rejects.toThrow(/da nop, khong sua duoc/);
    await expect(
      sql(`update attempts set deadline = deadline + interval '1 hour' where id = $1`, [id]),
    ).rejects.toThrow(/da nop, khong sua duoc/);
  });

  it('không xóa Lượt làm bài', async () => {
    const id = await attempt(anId, { status: 'submitted' });
    await expect(sql(`delete from attempts where id = $1`, [id])).rejects.toThrow(/khong xoa duoc/);
  });
});

describe('Câu trả lời: trigger (Q217)', () => {
  it('ghi và sửa được khi Lượt đang làm; mỗi câu một dòng', async () => {
    const id = await attempt(anId);
    await respond(id, itemIds[0] as string);
    await sql(
      `update responses set value = '{"optionId":"o2"}'::jsonb, client_seq = 2 where attempt_id = $1`,
      [id],
    );
    await expect(respond(id, itemIds[0] as string, 3)).rejects.toThrow(
      /responses_attempt_id_item_id_pk/,
    );
    await respond(id, itemIds[1] as string);
  });

  it('Lượt đã nộp thì không ghi mới và không sửa Câu trả lời', async () => {
    const id = await attempt(anId);
    await respond(id, itemIds[0] as string);
    await sql(
      `update attempts set status = 'submitted', submitted_at = now(), submit_reason = 'candidate' where id = $1`,
      [id],
    );
    await expect(respond(id, itemIds[1] as string)).rejects.toThrow(/da nop, khong ghi them/);
    await expect(
      sql(`update responses set value = '{"optionId":"o2"}'::jsonb where attempt_id = $1`, [id]),
    ).rejects.toThrow(/da nop, khong ghi them/);
  });

  it('câu phải thuộc Bộ đề của Phiên thi', async () => {
    const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    const other = await publishedExam(t, cookie, 'Bộ đề khác');
    const [foreign] = await sql<{ id: string }>(
      `select id from exam_items where exam_id = $1 limit 1`,
      [other.id],
    );
    const id = await attempt(anId);
    await expect(respond(id, (foreign as { id: string }).id)).rejects.toThrow(/khong thuoc Bo de/);
  });

  it('không chuyển Câu trả lời sang câu hay Lượt khác', async () => {
    const id = await attempt(anId);
    await respond(id, itemIds[0] as string);
    await expect(
      sql(`update responses set item_id = $2 where attempt_id = $1`, [id, itemIds[1]]),
    ).rejects.toThrow(/khong doi sang/);
  });

  it('số thứ tự lần lưu không âm', async () => {
    const id = await attempt(anId);
    await expect(respond(id, itemIds[0] as string, -1)).rejects.toThrow(/responses_seq_check/);
  });
});

describe('Phiên thi đã có Lượt (Q217)', () => {
  it('không đổi Bộ đề và hai công tắc xáo trộn, nhưng vẫn đổi được thứ khác', async () => {
    await attempt(anId);
    await expect(
      sql(`update sessions set shuffle_items = true where id = $1`, [sessionId]),
    ).rejects.toThrow(/da co Luot lam bai/);
    await expect(
      sql(`update sessions set shuffle_options = true where id = $1`, [sessionId]),
    ).rejects.toThrow(/da co Luot lam bai/);
    const cookie = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    const other = await publishedExam(t, cookie, 'Bộ đề khác');
    await expect(
      sql(`update sessions set exam_id = $2 where id = $1`, [sessionId, other.id]),
    ).rejects.toThrow(/da co Luot lam bai/);
    await sql(
      `update sessions set closes_at = closes_at + interval '1 hour', title = 'Ca 1b' where id = $1`,
      [sessionId],
    );
  });

  it('chưa có Lượt thì vẫn đổi được như trước', async () => {
    await sql(`update sessions set shuffle_items = true, shuffle_options = true where id = $1`, [
      sessionId,
    ]);
  });
});
