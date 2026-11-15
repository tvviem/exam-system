import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityMaintenanceJob } from '../src/modules/identity/maintenance/identity-maintenance.job';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { days } from './support/fake-clock';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// PR 7d-3, lát 11 (docs/plan/slice-7d-thiet-ke-kiem-thu.md K21): Phiếu tài khoản và "Cấp lại mật khẩu tạm" đã bị bỏ hẳn.
// "Không còn đường nào" = Nest trả 404 "Cannot ..." (route không tồn tại), khác 404 của ApiError (có route, không thấy bản ghi).

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp({ realMessageBuilder: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  t.mail.reset();
});

async function signedIn(input: SeedUser) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}
const ID = '00000000-0000-4000-8000-000000000001';
const noRoute = (res: { statusCode: number; json: () => { message?: string } }) => {
  expect(res.statusCode).toBe(404);
  expect(res.json().message).toMatch(/^Cannot (GET|POST)/);
};

describe('bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm" (K21)', () => {
  it('D-40: các đường tải Phiếu và cấp lại mật khẩu tạm không còn (Quản trị viên và Người ra đề đều 404 "Cannot ...")', async () => {
    const admin = await signedIn({ isAdmin: true, fullName: 'Quản Trị' });
    const examiner = await signedIn({ roleTags: ['examiner'], fullName: 'Người Ra Đề' });
    for (const who of [admin, examiner]) {
      noRoute(await call(t.app, 'GET', `/api/credential-slips/${ID}/pdf`, { cookie: who.cookie }));
      noRoute(await call(t.app, 'GET', `/api/credential-slips/${ID}/xlsx`, { cookie: who.cookie }));
      noRoute(
        await call(t.app, 'GET', `/api/account-requests/${ID}/slips`, { cookie: who.cookie }),
      );
      noRoute(
        await call(t.app, 'POST', `/api/sessions/${ID}/roster/${ID}/reissue-password`, {
          cookie: who.cookie,
        }),
      );
    }
    noRoute(
      await call(t.app, 'POST', `/api/admin/users/${ID}/temporary-password`, {
        cookie: admin.cookie,
      }),
    );
  });

  it('D-41: bảng và kiểu credential_slips không còn trong cơ sở dữ liệu', async () => {
    const [table] = await sql<{ t: string | null }>(
      "SELECT to_regclass('public.credential_slips')::text AS t",
    );
    expect(table?.t).toBeNull();
    expect(
      await sql("SELECT 1 FROM pg_type WHERE typname = 'credential_slip_status'"),
    ).toHaveLength(0);
  });

  it('D-42: job dọn dẹp không còn bước Phiếu; các bước còn lại vẫn chạy (xóa lịch sử đăng nhập cũ, yêu cầu kẹt ở parsing)', async () => {
    const admin = await seedUser({ isAdmin: true, fullName: 'Quản Trị' });
    const examiner = await seedUser({ roleTags: ['examiner'], fullName: 'Người Ra Đề' });
    const old = new Date(t.clock.now().getTime() - days(400));
    await sql(
      `INSERT INTO login_events (id, user_id, identifier_tried, success, ip, at, created_at, updated_at) VALUES (gen_random_uuid(), $1, 'cu', true, '1.1.1.1', $2, $2, $2)`,
      [admin.id, old],
    );
    await sql(
      `INSERT INTO account_requests (id, requested_by, original_filename, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'ket.csv', 'parsing', $2, $2)`,
      [examiner.id, new Date(t.clock.now().getTime() - 60 * 60_000)],
    );

    await t.app.get(IdentityMaintenanceJob).run();

    expect(await sql("SELECT 1 FROM login_events WHERE identifier_tried = 'cu'")).toHaveLength(0);
    const [request] = await sql<{ status: string }>(
      "SELECT status FROM account_requests WHERE original_filename = 'ket.csv'",
    );
    expect(request?.status).toBe('parse_failed');
  });
});
