import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BackupService } from '../src/modules/backup/backup.service';
import { JobRegistry } from '../src/queue/job-queue';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { days, hours, minutes } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let adminCookie: string;
let adminId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  const admin = await seedUser({ username: 'qt', isAdmin: true, fullName: 'Quản Trị' });
  adminId = admin.id;
  adminCookie = (await login(t.app, 'qt', DEFAULT_PASSWORD)).cookie as string;
});

let runSeq = 0;
/** Chèn một dòng `backup_runs` như script sao lưu vẫn làm (bằng SQL, ứng dụng không có đường ghi). */
async function addRun(
  kind: string,
  status: 'ok' | 'failed',
  ago: number,
  extra: { seconds?: number; bytes?: number; detail?: string } = {},
) {
  runSeq += 1;
  await sql(
    `INSERT INTO backup_runs (id, run_key, kind, status, finished_at, seconds, bytes, detail)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
    [
      `k${runSeq}`,
      kind,
      status,
      new Date(t.clock.now().getTime() - ago),
      extra.seconds ?? null,
      extra.bytes ?? null,
      extra.detail ?? null,
    ],
  );
}

const bells = (userId: string, type?: string) =>
  sql<{ type: string; data: Record<string, unknown>; read_at: Date | null }>(
    `SELECT type, data, read_at FROM notifications WHERE user_id = $1 ${type ? 'AND type = $2' : ''} ORDER BY created_at`,
    type ? [userId, type] : [userId],
  );
const unread = async (userId: string, type: string) =>
  (await bells(userId, type)).filter((n) => n.read_at === null);
const check = (uptimeSeconds: number) => t.app.get(BackupService).check(uptimeSeconds);
const ENOUGH_UPTIME = 31 * 60;

describe('màn hình Sao lưu (Q365): API chỉ đọc', () => {
  it('trả tóm tắt (bản đêm, bản nền, thử khôi phục, vấn đề) và danh sách mới nhất trước', async () => {
    await addRun('dump-nightly', 'ok', hours(30), { seconds: 3, bytes: 150_000, detail: 'cũ' });
    await addRun('dump-nightly', 'ok', hours(2), { seconds: 4, bytes: 152_000, detail: 'mới' });
    await addRun('basebackup', 'ok', days(1), { seconds: 2, bytes: 4_300_000 });
    await addRun('restore-test', 'ok', days(10), { seconds: 27 });
    await addRun('push', 'failed', minutes(40), { detail: 'đẩy lên R2 lỗi' });

    const res = await call(t.app, 'GET', '/api/admin/backup', { cookie: adminCookie });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary.nightly).toMatchObject({
      kind: 'dump-nightly',
      bytes: 152_000,
      detail: 'mới',
    });
    expect(body.summary.base).toMatchObject({ kind: 'basebackup', status: 'ok' });
    expect(body.summary.restoreTest).toMatchObject({ status: 'ok', seconds: 27 });
    expect(body.summary.issues).toHaveLength(1);
    expect(body.summary.issues[0]).toMatchObject({ kind: 'push', detail: 'đẩy lên R2 lỗi' });
    expect(body.runs).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    // Mới nhất trước: push (40 phút), bản đêm (2 giờ), bản nền (1 ngày), bản đêm cũ (30 giờ), thử khôi phục (10 ngày).
    expect(body.runs.items.map((r: { kind: string }) => r.kind)).toEqual([
      'push',
      'dump-nightly',
      'basebackup',
      'dump-nightly',
      'restore-test',
    ]);
  });

  it('có dòng ok sau lỗi thì hết "vấn đề" (đã phục hồi)', async () => {
    await addRun('push', 'failed', hours(2), { detail: 'lỗi' });
    await addRun('push', 'ok', minutes(10), { detail: 'đã phục hồi' });
    const res = await call(t.app, 'GET', '/api/admin/backup', { cookie: adminCookie });
    expect(res.json().summary.issues).toEqual([]);
  });

  it('chưa có dòng nào: các ô trống, danh sách rỗng', async () => {
    const res = await call(t.app, 'GET', '/api/admin/backup', { cookie: adminCookie });
    expect(res.json()).toMatchObject({
      summary: { nightly: null, base: null, restoreTest: null, issues: [] },
      runs: { total: 0, items: [] },
    });
  });

  it('phân trang theo pageSize', async () => {
    for (let i = 0; i < 5; i++) await addRun('dump-nightly', 'ok', hours(i + 1));
    const res = await call(t.app, 'GET', '/api/admin/backup?page=2&pageSize=2', {
      cookie: adminCookie,
    });
    expect(res.json().runs).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(res.json().runs.items).toHaveLength(2);
  });

  it('chỉ Quản trị viên xem được; chưa đăng nhập bị từ chối', async () => {
    await seedUser({ username: 'gv', roleTags: ['examiner'] });
    const cookie = (await login(t.app, 'gv', DEFAULT_PASSWORD)).cookie as string;
    expect((await call(t.app, 'GET', '/api/admin/backup', { cookie })).statusCode).toBe(403);
    expect((await call(t.app, 'GET', '/api/admin/backup')).statusCode).toBe(401);
  });

  it('không có đường ghi nào từ ứng dụng', async () => {
    const res = await call(t.app, 'POST', '/api/admin/backup', {
      cookie: adminCookie,
      body: { kind: 'x', status: 'ok' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('chuông "bản đêm quá 26 giờ" (Q363)', () => {
  it('chưa có dòng nào trong bảng thì không báo', async () => {
    await check(ENOUGH_UPTIME);
    expect(await bells(adminId)).toHaveLength(0);
  });

  it('bản đêm 25 giờ trước chưa quá hạn', async () => {
    await addRun('dump-nightly', 'ok', hours(25));
    await check(ENOUGH_UPTIME);
    expect(await bells(adminId, 'backup.stale')).toHaveLength(0);
  });

  it('quá 26 giờ nhưng ứng dụng mới chạy dưới 30 phút thì chưa báo (chừa thời gian cho catchup)', async () => {
    await addRun('dump-nightly', 'ok', hours(29));
    await check(10 * 60);
    expect(await bells(adminId, 'backup.stale')).toHaveLength(0);
    await check(30 * 60);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(1);
  });

  it('báo đúng một chuông cho mỗi Quản trị viên hoạt động, không nhân lên mỗi 30 phút', async () => {
    const second = await seedUser({ username: 'qt2', isAdmin: true });
    const locked = await seedUser({ username: 'qt3', isAdmin: true });
    await sql("UPDATE users SET status = 'locked' WHERE id = $1", [locked.id]);
    const examiner = await seedUser({ username: 'gv', roleTags: ['examiner'] });
    await addRun('dump-nightly', 'ok', hours(27));
    await check(ENOUGH_UPTIME);
    t.clock.advance(minutes(30));
    await check(ENOUGH_UPTIME);
    t.clock.advance(minutes(30));
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(1);
    expect(await unread(second.id, 'backup.stale')).toHaveLength(1);
    expect(await bells(locked.id)).toHaveLength(0);
    expect(await bells(examiner.id)).toHaveLength(0);
    const [bell] = await unread(adminId, 'backup.stale');
    expect(bell?.data).toMatchObject({ kind: 'dump-nightly' });
    expect(Number(bell?.data.hours)).toBeGreaterThanOrEqual(27);
  });

  it('có bản đêm mới thì chuông tự tắt', async () => {
    await addRun('dump-nightly', 'ok', hours(30));
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(1);
    await addRun('dump-nightly', 'ok', minutes(5));
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(0);
    expect(await bells(adminId, 'backup.stale')).toHaveLength(1); // vẫn còn trong danh sách, đã đọc
  });

  it('bản đêm lỗi không tính là bản đêm: vẫn quá hạn thì vẫn báo', async () => {
    await addRun('dump-nightly', 'ok', hours(30));
    await addRun('dump-nightly', 'failed', hours(1), { detail: 'pg_dump lỗi' });
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(1);
  });

  it('chưa từng có bản đêm ok: tính từ dòng đầu tiên trong bảng', async () => {
    await addRun('push', 'failed', hours(3), { detail: 'lỗi' });
    await check(ENOUGH_UPTIME);
    expect(await bells(adminId, 'backup.stale')).toHaveLength(0);
    await sql('DELETE FROM backup_runs');
    await addRun('push', 'failed', hours(28), { detail: 'lỗi' });
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.stale')).toHaveLength(1);
  });
});

describe('chuông khi việc sao lưu lỗi (Q364)', () => {
  it('kêu ngay khi một việc báo lỗi, kèm loại việc và lý do; một chuông mỗi loại', async () => {
    await addRun('dump-nightly', 'ok', minutes(30));
    await addRun('restore-test', 'failed', minutes(20), { detail: 'bước lỗi: dump' });
    await addRun('basebackup', 'failed', minutes(10), { detail: 'pg_basebackup lỗi' });
    await check(60); // ứng dụng mới chạy 1 phút: lỗi vẫn kêu ngay (chỉ "quá cũ" mới chờ 30 phút)
    await check(60);
    const failed = await unread(adminId, 'backup.failed');
    expect(failed).toHaveLength(2);
    expect(failed.map((n) => n.data.kind).sort()).toEqual(['basebackup', 'restore-test']);
    expect(failed.find((n) => n.data.kind === 'restore-test')?.data.detail).toBe('bước lỗi: dump');
  });

  it('có dòng ok (hoặc phục hồi) sau lỗi thì chuông của loại đó tự tắt, loại khác giữ', async () => {
    await addRun('push', 'failed', hours(2), { detail: 'đẩy lên R2 lỗi' });
    await addRun('basebackup', 'failed', hours(2), { detail: 'pg_basebackup lỗi' });
    await addRun('dump-nightly', 'ok', minutes(30));
    await check(ENOUGH_UPTIME);
    expect(await unread(adminId, 'backup.failed')).toHaveLength(2);
    await addRun('push', 'ok', minutes(1), { detail: 'đã phục hồi' });
    await check(ENOUGH_UPTIME);
    const left = await unread(adminId, 'backup.failed');
    expect(left.map((n) => n.data.kind)).toEqual(['basebackup']);
  });

  it('job backup.check chạy qua JobRegistry và không ném lỗi khi bảng trống', async () => {
    await expect(t.app.get(JobRegistry).run('backup.check', {})).resolves.not.toThrow();
  });
});

describe('dọn dẹp hằng ngày (Q366)', () => {
  const cleanup = () => t.app.get(JobRegistry).run('maintenance.cleanup', {});
  const addBell = (readAgoDays: number | null, createdAgoDays: number) =>
    sql(
      `INSERT INTO notifications (id, user_id, type, data, created_at, read_at)
       VALUES (gen_random_uuid(), $1, 'x', '{}', $2, $3)`,
      [
        adminId,
        new Date(t.clock.now().getTime() - days(createdAgoDays)),
        readAgoDays === null ? null : new Date(t.clock.now().getTime() - days(readAgoDays)),
      ],
    );

  it('xóa thông báo ĐÃ ĐỌC quá 90 ngày; chưa đọc và đã đọc gần đây thì giữ', async () => {
    await addBell(91, 200); // đã đọc 91 ngày trước: xóa
    await addBell(89, 200); // đã đọc 89 ngày trước: giữ
    await addBell(null, 400); // chưa đọc, rất cũ: giữ
    await cleanup();
    const left = await sql<{ read_at: Date | null }>('SELECT read_at FROM notifications');
    expect(left).toHaveLength(2);
    expect(left.filter((n) => n.read_at === null)).toHaveLength(1);
  });

  it('job backup.check xóa kết quả sao lưu quá 12 tháng, giữ dòng mới hơn', async () => {
    await addRun('dump-nightly', 'ok', days(370));
    await addRun('dump-nightly', 'ok', days(300));
    await t.app.get(JobRegistry).run('backup.check', {});
    expect(await sql('SELECT 1 FROM backup_runs')).toHaveLength(1);
  });
});
