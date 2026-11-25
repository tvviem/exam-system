import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureHeavyQueryGate, heavyQueryGate } from '../src/common/heavy-query-gate';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, type SeedUser, seedUser } from './support/users';

// Giới hạn truy vấn nặng đồng thời (docs/plan/quy-mo-lon-thiet-ke.md mục 6.2, Q482): API danh sách và tìm kiếm đi qua cổng chung;
// đường của Người dự thi không đi qua cổng nên không bao giờ phải chờ.

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(resetState);
afterEach(() => configureHeavyQueryGate());

async function signedIn(input: SeedUser = {}) {
  const user = await seedUser(input);
  const { cookie } = await login(t.app, user.username as string, DEFAULT_PASSWORD);
  return { ...user, cookie: cookie as string };
}

/** Chiếm hết chỗ chung bằng một việc giả; trả hàm nhả chỗ. */
function occupy(maxQueuePerKey: number) {
  configureHeavyQueryGate({ total: 1, maxQueuePerKey, waitMs: 5000 });
  let release!: () => void;
  const held = heavyQueryGate().run(
    'bai-kiem-tra',
    1,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  return async () => {
    release();
    await held;
  };
}

describe('API danh sách và tìm kiếm đi qua cổng chung', () => {
  it('hết chỗ và hết hàng đợi: trả SERVER_BUSY; có chỗ lại thì chạy bình thường', async () => {
    const admin = await signedIn({ isAdmin: true });
    const examiner = await signedIn({ roleTags: ['examiner'] });
    // Mã Phiên thi không có thật: gợi ý người vẫn phải qua cổng trước khi biết Phiên thi không tồn tại.
    const noSession = '00000000-0000-7000-8000-000000000000';
    const heavy: [string, string, number][] = [
      ['/api/admin/users', admin.cookie, 200],
      ['/api/admin/login-events', admin.cookie, 200],
      ['/api/admin/audit-logs', admin.cookie, 200],
      ['/api/questions', examiner.cookie, 200],
      ['/api/topics', examiner.cookie, 200],
      [`/api/sessions/${noSession}/roster/search?q=an`, examiner.cookie, 404],
    ];
    const release = occupy(0);
    for (const [url, cookie] of heavy) {
      const res = await call(t.app, 'GET', url, { cookie });
      expect(res.statusCode, url).toBe(503);
      expect(res.json(), url).toMatchObject({ code: 'SERVER_BUSY' });
    }
    await release();
    for (const [url, cookie, status] of heavy) {
      expect((await call(t.app, 'GET', url, { cookie })).statusCode, url).toBe(status);
    }
  });

  it('còn hàng đợi thì yêu cầu chờ rồi được phục vụ', async () => {
    const admin = await signedIn({ isAdmin: true });
    const release = occupy(5);
    let finished = false;
    const waiting = call(t.app, 'GET', '/api/admin/users', { cookie: admin.cookie }).then((res) => {
      finished = true;
      return res;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(finished).toBe(false);
    await release();
    expect((await waiting).statusCode).toBe(200);
  });

  it('cổng đầy không ảnh hưởng đường của Người dự thi', async () => {
    const candidate = await signedIn({ roleTags: ['candidate'] });
    const release = occupy(0);
    for (const url of ['/api/auth/me', '/api/notifications']) {
      expect((await call(t.app, 'GET', url, { cookie: candidate.cookie })).statusCode, url).toBe(
        200,
      );
    }
    await release();
  });

  it('người không có quyền bị từ chối trước khi chiếm chỗ', async () => {
    const candidate = await signedIn({ roleTags: ['candidate'] });
    const release = occupy(0);
    const res = await call(t.app, 'GET', '/api/admin/users', { cookie: candidate.cookie });
    expect(res.statusCode).toBe(403);
    await release();
  });
});
