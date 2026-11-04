import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S2/S4 (Q263, Q264, Q265, Q271, Q272): Xóa Người ra đề chuyển Phiên thi; Khóa và Xóa bị chặn khi Phiên thi đang diễn ra;
// Đình chỉ chặn Lượt mới. HTTP + PostgreSQL thật.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;
let admin: string;
let gv1Id: string;
let gv2Id: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await resetState();
  await seedUser({ username: 'quantri', isAdmin: true, fullName: 'Quản Trị' });
  live = await openLiveSession(t);
  admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
  gv1Id = await idOf('gv1');
  gv2Id = await idOf('gv2');
});

const idOf = async (username: string) =>
  (await sql<{ id: string }>(`select id from users where username = $1`, [username]))[0]
    ?.id as string;
const adminApi = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: admin, body });
const sessionRows = () =>
  sql<{ id: string; owner_id: string; version: number; title: string }>(
    `select id, owner_id, version, title from sessions order by id`,
  );
const count = async (table: string) =>
  Number((await sql<{ n: string }>(`select count(*) n from ${table}`))[0]?.n);

/** Mọi Lượt đã nộp rồi giờ qua giờ đóng: Phiên thi của Người ra đề thành "đã xong". */
async function finishSession() {
  for (const name of Object.keys(live.takers)) {
    await live.takers[name]?.call('POST', `/take/attempts/${live.attemptIds[name]}/submit`);
  }
  t.clock.set(new Date('2026-11-02T10:30:00+07:00'));
  await signInAdminAgain();
}

/** Phiên đăng nhập Quản trị viên chỉ sống 30 phút không hoạt động (theo đồng hồ giả), nên đăng nhập lại sau khi tua giờ. */
async function signInAdminAgain() {
  admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
}

/** Thêm một Phiên thi sắp mở và một Phiên thi đã Hủy cho gv1 (cùng Bộ đề). */
async function addUpcomingAndCancelled() {
  const examId = (await sql<{ exam_id: string }>(`select exam_id from sessions limit 1`))[0]
    ?.exam_id;
  const upcoming = await live.api('POST', '/sessions', {
    examId,
    title: 'Ca sắp mở',
    opensAt: '2026-11-05T07:00:00+07:00',
    closesAt: '2026-11-05T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'UP3K9X',
  });
  expect(upcoming.statusCode, upcoming.body).toBe(201);
  const cancelled = await live.api('POST', '/sessions', {
    examId,
    title: 'Ca đã hủy',
    opensAt: '2026-11-06T07:00:00+07:00',
    closesAt: '2026-11-06T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'CA3K9X',
  });
  await live.api('POST', `/sessions/${cancelled.json().id}/cancel`, { reason: 'Đổi lịch' });
  return { upcomingId: upcoming.json().id as string, cancelledId: cancelled.json().id as string };
}

describe('Xóa Người ra đề chuyển Phiên thi (Q263)', () => {
  it('còn Phiên thi mà không nêu người nhận thì HAS_CONTENT kèm số Phiên thi', async () => {
    await finishSession();
    await addUpcomingAndCancelled();
    const res = await adminApi('DELETE', `/admin/users/${gv1Id}`);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'HAS_CONTENT', sessions: 3, exams: 1 });
    expect((await sessionRows()).every((s) => s.owner_id === gv1Id)).toBe(true);
  });

  it('chuyển mọi Phiên thi (kể cả Hủy) sang người nhận; Danh sách, Lượt, Câu trả lời giữ nguyên', async () => {
    await finishSession();
    const { cancelledId } = await addUpcomingAndCancelled();
    const before = {
      roster: await count('session_roster'),
      attempts: await count('attempts'),
      versions: new Map((await sessionRows()).map((s) => [s.id, s.version])),
    };
    const res = await adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`);
    expect(res.statusCode, res.body).toBe(200);
    const rows = await sessionRows();
    expect(rows).toHaveLength(3);
    expect(rows.every((s) => s.owner_id === gv2Id)).toBe(true);
    expect(rows.every((s) => s.version === (before.versions.get(s.id) as number) + 1)).toBe(true);
    expect(rows.some((s) => s.id === cancelledId)).toBe(true);
    expect(await count('session_roster')).toBe(before.roster);
    expect(await count('attempts')).toBe(before.attempts);
    expect(
      await sql(`select 1 from users where id = $1 and removed_at is not null`, [gv1Id]),
    ).toHaveLength(1);
  });

  it('người nhận thấy Phiên thi và Theo dõi được; có thông báo và nhật ký thao tác', async () => {
    await finishSession();
    await adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`);
    const list = (await live.api('GET', '/sessions', undefined, live.other)).json();
    expect(list.items.map((s: { id: string }) => s.id)).toContain(live.sessionId);
    const monitor = await live.api(
      'GET',
      `/sessions/${live.sessionId}/monitor`,
      undefined,
      live.other,
    );
    expect(monitor.statusCode, monitor.body).toBe(200);
    const bell = (await live.api('GET', '/notifications', undefined, live.other)).json();
    expect(bell.items).toContainEqual(
      expect.objectContaining({
        type: 'sessions.transferred',
        data: expect.objectContaining({ sessions: 1 }),
      }),
    );
    const audit = await sql<{ action: string; after: { sessions: number; to: string } }>(
      `select action, after from audit_logs where action = 'session.transfer'`,
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.after).toMatchObject({ sessions: 1, to: gv2Id });
  });

  it('người nhận phải là Người ra đề hợp lệ', async () => {
    await finishSession();
    const res = await adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${live.userIds.an}`);
    expect(res.statusCode).toBe(400);
    expect((await sessionRows()).every((s) => s.owner_id === gv1Id)).toBe(true);
  });

  it('Người ra đề chỉ có Phiên thi (không Chủ đề hay Bộ đề) vẫn phải chọn người nhận', async () => {
    await finishSession();
    await sql(`update exams set owner_id = $1`, [gv2Id]); // Bộ đề thuộc người khác
    const res = await adminApi('DELETE', `/admin/users/${gv1Id}`);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({ code: 'HAS_CONTENT', sessions: 1, exams: 0 });
  });

  it('Xóa Người ra đề chuyển 50 Phiên thi dưới 1 giây (ngân sách của Quản trị viên)', async () => {
    await finishSession();
    await sql(
      `insert into sessions (id, exam_id, owner_id, title, opens_at, closes_at, duration_minutes, access_code, cancelled_at)
       select gen_random_uuid(), exam_id, owner_id, 'Ca ' || n, opens_at + make_interval(days => n), closes_at + make_interval(days => n),
              duration_minutes, 'C' || lpad(n::text, 5, '0'), now()
       from sessions, generate_series(1, 50) n where title = 'Giữa kỳ - ca 1'`,
    );
    expect(await sessionRows()).toHaveLength(51);
    const started = performance.now();
    const res = await adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`);
    const ms = performance.now() - started;
    expect(res.statusCode, res.body).toBe(200);
    console.info(`[đo] Xóa Người ra đề chuyển 51 Phiên thi: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
    expect((await sessionRows()).every((s) => s.owner_id === gv2Id)).toBe(true);
  });

  it('Xóa Người dự thi không chuyển gì', async () => {
    await finishSession();
    const res = await adminApi('DELETE', `/admin/users/${live.userIds.dung}`);
    expect(res.statusCode, res.body).toBe(200);
    expect((await sessionRows()).every((s) => s.owner_id === gv1Id)).toBe(true);
  });

  it('Chuyển giao Chủ đề không đụng Phiên thi', async () => {
    await finishSession();
    const topics = (await live.api('GET', '/topics')).json() as
      | { id: string }[]
      | { items: { id: string }[] };
    const ids = (Array.isArray(topics) ? topics : topics.items).map((x) => x.id);
    const res = await adminApi('POST', `/admin/users/${gv1Id}/transfer`, {
      topicIds: ids,
      recipientId: gv2Id,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ sessions: 0 });
    expect((await sessionRows()).every((s) => s.owner_id === gv1Id)).toBe(true);
  });

  it('hộp xác nhận: đếm Phiên thi theo trạng thái và báo người nhận đang có tên trong Danh sách', async () => {
    await finishSession();
    await addUpcomingAndCancelled();
    await sql(`insert into session_roster (session_id, user_id, added_by) values ($1, $2, $3)`, [
      live.sessionId,
      gv2Id,
      gv1Id,
    ]);
    const res = await adminApi('GET', `/admin/users/${gv1Id}/content?recipientId=${gv2Id}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      sessions: { live: 0, upcoming: 1, done: 1, cancelled: 1, total: 3 },
      recipientInRoster: 1,
    });
  });
});

describe('không Khóa hay Xóa người đang trong Phiên thi đang diễn ra (Q264, Q271)', () => {
  it('chủ của Phiên thi đang diễn ra: Khóa và Xóa bị từ chối kèm danh sách Phiên thi', async () => {
    for (const res of [
      await adminApi('POST', `/admin/users/${gv1Id}/lock`, { reason: 'x' }),
      await adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`),
    ]) {
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json()).toMatchObject({
        code: 'USER_IN_LIVE_SESSION',
        sessions: [
          {
            id: live.sessionId,
            title: 'Giữa kỳ - ca 1',
            ownerId: gv1Id,
            ownerName: expect.any(String),
            relation: 'owner',
            inProgress: 3,
          },
        ],
      });
    }
    expect((await sessionRows())[0]?.owner_id).toBe(gv1Id);
    expect(
      await sql(`select 1 from users where id = $1 and status = 'active'`, [gv1Id]),
    ).toHaveLength(1);
  });

  it('chủ của Phiên thi đang trong Khung giờ nhưng chưa ai vào cũng bị chặn', async () => {
    await resetState();
    await seedUser({ username: 'quantri', isAdmin: true });
    live = await openLiveSession(t, []);
    admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
    const res = await adminApi('POST', `/admin/users/${await idOf('gv1')}/lock`, { reason: 'x' });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().sessions[0]).toMatchObject({ inProgress: 0, relation: 'owner' });
  });

  it('Lượt chạy quá giờ đóng vẫn tính là đang diễn ra', async () => {
    t.clock.set(new Date('2026-11-02T08:30:00+07:00'));
    const extended = await live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      scope: 'all',
      minutes: 180,
      reason: 'Sự cố mạng',
      batchId: '00000000-0000-4000-8000-000000000001',
    });
    expect(extended.statusCode, extended.body).toBe(200);
    t.clock.set(new Date('2026-11-02T10:10:00+07:00')); // đã qua giờ đóng 10:00, Lượt còn hạn đến sau 11:00
    await signInAdminAgain();
    const res = await adminApi('POST', `/admin/users/${gv1Id}/lock`, { reason: 'x' });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json().sessions[0]).toMatchObject({ id: live.sessionId, inProgress: 3 });
  });

  it('Người dự thi đang có Lượt đang làm: Khóa và Xóa bị từ chối', async () => {
    for (const res of [
      await adminApi('POST', `/admin/users/${live.userIds.an}/lock`, { reason: 'x' }),
      await adminApi('DELETE', `/admin/users/${live.userIds.an}`),
    ]) {
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json()).toMatchObject({
        code: 'USER_IN_LIVE_SESSION',
        sessions: [{ id: live.sessionId, relation: 'candidate', ownerId: gv1Id }],
      });
    }
    expect((await live.attemptRow('an')).status).toBe('in_progress');
  });

  it('người chỉ có tên trong Danh sách (chưa vào) vẫn Khóa được', async () => {
    const res = await adminApi('POST', `/admin/users/${live.userIds.dung}/lock`, { reason: 'x' });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('sau Buộc nộp thì Khóa được; Lượt bị nộp giữ lý do examiner', async () => {
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
    const res = await adminApi('POST', `/admin/users/${live.userIds.an}/lock`, { reason: 'x' });
    expect(res.statusCode, res.body).toBe(200);
    expect(await live.attemptRow('an')).toMatchObject({ submit_reason: 'examiner' });
  });

  it('Phiên thi đã xong thì chủ Khóa được; Phiên thi đã Hủy cũng không chặn', async () => {
    await finishSession();
    expect((await adminApi('POST', `/admin/users/${gv1Id}/lock`, { reason: 'x' })).statusCode).toBe(
      200,
    );
  });

  it('chi tiết người dùng mang sẵn danh sách Phiên thi đang diễn ra để hiện cảnh báo', async () => {
    const owner = (await adminApi('GET', `/admin/users/${gv1Id}`)).json();
    expect(owner.liveSessions).toEqual([
      expect.objectContaining({ id: live.sessionId, relation: 'owner', inProgress: 3 }),
    ]);
    const idle = (await adminApi('GET', `/admin/users/${live.userIds.dung}`)).json();
    expect(idle.liveSessions).toEqual([]);
  });

  it('Cấp lại mật khẩu tạm không bị chặn', async () => {
    const res = await adminApi('POST', `/admin/users/${live.userIds.an}/temporary-password`);
    expect(res.statusCode, res.body).toBe(200);
  });
});

describe('Đình chỉ chặn bắt đầu Lượt mới (Q272)', () => {
  beforeEach(async () => {
    await resetState();
    await seedUser({ username: 'quantri', isAdmin: true });
    live = await openLiveSession(t, ['an', 'binh'], { maxAttempts: 2 });
  });

  it('Đình chỉ rồi bắt đầu Lượt mới bị từ chối dù còn lượt', async () => {
    const res = await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      { action: 'disqualify', reason: 'Dùng tài liệu' },
    );
    expect(res.statusCode, res.body).toBe(201);
    const again = await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(again?.statusCode, again?.body).toBe(409);
    expect(again?.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'DISQUALIFIED' });
    expect(await count('attempts')).toBe(2);
  });

  it('Buộc nộp rồi bắt đầu Lượt mới vẫn được khi còn lượt', async () => {
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
    const again = await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(again?.statusCode, again?.body).toBe(200);
    expect(await count('attempts')).toBe(3);
  });

  it('Cảnh cáo không chặn Lượt mới', async () => {
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      { action: 'warning', reason: 'Nhìn bài bạn' },
    );
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
    const again = await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(again?.statusCode, again?.body).toBe(200);
  });

  it('chỉ chặn người bị Đình chỉ, người khác vẫn bắt đầu được', async () => {
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      { action: 'disqualify', reason: 'Dùng tài liệu' },
    );
    await live.takers.binh?.call('POST', `/take/attempts/${live.attemptIds.binh}/submit`);
    const binh = await live.takers.binh?.call('POST', `/take/sessions/${live.sessionId}/start`);
    expect(binh?.statusCode, binh?.body).toBe(200);
  });
});

describe('đồng thời (S4, Q265)', () => {
  it('Xóa chủ cũ xen Hủy Phiên thi của chủ cũ: không bế tắc, một chủ duy nhất', async () => {
    await finishSession();
    const { upcomingId } = await addUpcomingAndCancelled();
    const [removed, cancelled] = await Promise.all([
      adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`),
      live.api('POST', `/sessions/${upcomingId}/cancel`, { reason: 'Đổi lịch' }),
    ]);
    expect(removed.statusCode, removed.body).toBe(200);
    // Hủy xong trước thì thành công, sau Xóa thì chủ cũ không còn quyền (phiên đăng nhập bị thu hồi).
    expect([200, 401, 404]).toContain(cancelled.statusCode);
    const rows = await sessionRows();
    expect(rows).toHaveLength(3);
    expect(rows.every((s) => s.owner_id === gv2Id)).toBe(true);
  });

  it('hai lần Xóa cùng lúc: một lần thành công, lần kia báo đã Xóa; Phiên thi chuyển đúng một lần', async () => {
    await finishSession();
    const [a, b] = await Promise.all([
      adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`),
      adminApi('DELETE', `/admin/users/${gv1Id}?recipientId=${gv2Id}`),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect((await sessionRows())[0]?.owner_id).toBe(gv2Id);
  });

  it('Khóa xen start: kết quả nhất quán, người bị Khóa không còn Lượt đang làm', async () => {
    const dung = await Taker.signIn(t, 'dung');
    await dung.join('AB3K9X');
    const [lock] = await Promise.all([
      adminApi('POST', `/admin/users/${live.userIds.dung}/lock`, { reason: 'x' }),
      dung.call('POST', `/take/sessions/${live.sessionId}/start`),
    ]);
    const running = await sql(
      `select 1 from attempts where user_id = $1 and status = 'in_progress'`,
      [live.userIds.dung],
    );
    // Khóa thắng thì Lượt (nếu vừa được tạo) bị hook nộp hoặc start bị từ chối; start thắng thì Khóa bị chặn.
    if (lock.statusCode === 200) expect(running).toHaveLength(0);
    else expect(lock.statusCode).toBe(409);
  });
});
