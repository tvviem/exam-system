import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD } from './support/users';

// Hồi quy tìm ra khi đo tải 500 người (docs/plan/slice-5.md, PR 5e): gửi và xử lý Phúc khảo từng lấy thêm một kết nối từ nhóm kết nối
// NGAY TRONG giao dịch, nên khi số yêu cầu cùng lúc bằng cỡ nhóm, mọi giao dịch giữ kết nối và chờ nhau mãi (api "postgres down").
// Nhóm chỉ 3 kết nối, ba yêu cầu cùng lúc: không được treo.

let t: TestApp;
beforeAll(async () => {
  process.env.DB_POOL_MAX = '3';
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  delete process.env.DB_POOL_MAX;
});

describe('Phúc khảo với nhóm kết nối nhỏ', () => {
  it('ba Phúc khảo cùng lúc rồi ba lần xử lý cùng lúc đều xong, không treo', async () => {
    await resetState();
    const live = await openLiveSession(t, ['an']);
    const taker = live.takers.an as Taker;
    const attemptId = live.attemptIds.an as string;
    await taker.call('POST', `/take/attempts/${attemptId}/submit`);
    await t.queue.drain();
    t.clock.set(new Date('2026-11-02T10:30:00+07:00')); // quá Khung giờ
    live.examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    const api = (method: 'GET' | 'PUT' | 'POST', path: string, body?: unknown) =>
      call(t.app, method, `/api/sessions/${live.sessionId}${path}`, {
        cookie: live.examiner,
        body,
      });
    const detail = (await api('GET', '/grading/items')).json();
    for (const essay of detail.items as { itemId: string }[]) {
      await api('PUT', `/grading/attempts/${attemptId}/items/${essay.itemId}`, { score: 0.5 });
    }
    expect((await api('POST', '/release', { appealPeriodDays: 3 })).statusCode).toBe(200);

    const mine = await Taker.signIn(t, 'an');
    const result = (await mine.call('GET', `/take/sessions/${live.sessionId}/result`)).json();
    const nos = (result.items as { no: number }[]).slice(0, 3).map((i) => i.no);
    const sent = await Promise.all(
      nos.map((no) =>
        mine.call('POST', `/take/sessions/${live.sessionId}/appeals`, {
          target: 'response',
          no,
          reason: 'Tôi nghĩ câu này chấm chưa đúng',
        }),
      ),
    );
    expect(sent.map((r) => r.statusCode)).toEqual([201, 201, 201]);

    const open = (await api('GET', '/appeals?status=open')).json().items as { id: string }[];
    expect(open).toHaveLength(3);
    const resolved = await Promise.all(
      open.map((a) =>
        api('POST', `/appeals/${a.id}/resolve`, { response: 'Đã xem lại', score: 0.5 }),
      ),
    );
    expect(resolved.map((r) => r.statusCode)).toEqual([200, 200, 200]);
  }, 20_000);
});
