import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { leaks } from './support/leaks';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';

// S2/S8 (Q213, Q257, Q198): heartbeat của Người dự thi qua HTTP + PostgreSQL + Redis thật.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await resetState();
  live = await openLiveSession(t);
});

const beat = (name: string, body: Record<string, unknown> = {}, id = live.attemptIds[name]) =>
  (live.takers[name] ?? live.takers.an)?.call('POST', `/take/attempts/${id}/heartbeat`, body);
const eventRows = () =>
  sql<{ type: string; user_id: string; client_event_id: string | null; at: Date }>(
    `select type, user_id, client_event_id, at from session_events order by id`,
  );

describe('nhịp cơ bản', () => {
  it('trả hạn, giờ server, thiết bị hợp lệ, danh sách thông báo rỗng và mốc cursor', async () => {
    const res = await beat('an');
    expect(res?.statusCode, res?.body).toBe(200);
    const body = res?.json();
    expect(body).toMatchObject({ status: 'in_progress', deviceOk: true, notices: [] });
    const row = await live.attemptRow('an');
    expect(new Date(body.deadline).getTime()).toBe(row.deadline.getTime());
    expect(body.serverNow).toBe(t.clock.now().toISOString());
    expect(new Date(body.cursor).getTime()).toBeLessThan(t.clock.now().getTime());
  });

  it('không mang đáp án hay quy tắc chấm (S8)', async () => {
    const res = await beat('an', { events: [{ id: crypto.randomUUID(), type: 'tab_hidden' }] });
    expect(leaks(res?.json())).toEqual([]);
  });

  it('người khác dùng mã Lượt của An nhận 404; Người ra đề không dùng được', async () => {
    const other = await live.takers.binh?.call(
      'POST',
      `/take/attempts/${live.attemptIds.an}/heartbeat`,
      {},
    );
    expect(other?.statusCode).toBe(404);
    const examiner = await live.api('POST', `/take/attempts/${live.attemptIds.an}/heartbeat`, {});
    expect(examiner.statusCode).toBe(403);
  });

  it('dữ liệu sai thì báo lỗi dữ liệu', async () => {
    for (const bad of [
      { events: [{ id: 'abc', type: 'tab_hidden' }] },
      { events: [{ id: crypto.randomUUID(), type: 'cheating' }] },
      { since: 'hôm qua' },
      { extra: 1 },
    ]) {
      expect((await beat('an', bad))?.statusCode).toBe(400);
    }
  });
});

describe('sự kiện rời màn hình, mất mạng (Q198)', () => {
  it('ghi từng loại sự kiện với giờ của server', async () => {
    const events = ['tab_hidden', 'tab_visible', 'went_offline', 'back_online'].map((type) => ({
      id: crypto.randomUUID(),
      type,
    }));
    expect((await beat('an', { events }))?.statusCode).toBe(200);
    const rows = await eventRows();
    expect(rows.map((r) => r.type)).toEqual(events.map((e) => e.type));
    expect(rows.map((r) => r.client_event_id)).toEqual(events.map((e) => e.id));
    expect(rows.every((r) => r.at.getTime() === t.clock.now().getTime())).toBe(true);
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([live.userIds.an]));
  });

  it('gửi lại cùng nhịp (mạng chập chờn) không ghi trùng sự kiện', async () => {
    const events = [{ id: crypto.randomUUID(), type: 'tab_hidden' }];
    await beat('an', { events });
    await beat('an', { events });
    const [a, b] = await Promise.all([beat('an', { events }), beat('an', { events })]);
    expect([a?.statusCode, b?.statusCode]).toEqual([200, 200]);
    expect(await eventRows()).toHaveLength(1);
  });

  it('cùng mã sự kiện của hai Lượt khác nhau vẫn là hai sự kiện', async () => {
    const events = [{ id: crypto.randomUUID(), type: 'tab_hidden' }];
    await beat('an', { events });
    await beat('binh', { events });
    expect(await eventRows()).toHaveLength(2);
  });
});

describe('thông báo Cộng giờ và Cảnh cáo (Q257)', () => {
  const extend = (body: Record<string, unknown> = {}) =>
    live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      attemptIds: [live.attemptIds.an],
      minutes: 15,
      reason: 'Mất điện',
      batchId: crypto.randomUUID(),
      ...body,
    });

  it('không có since thì không trả thông báo cũ (tải lại trang không phát lại lịch sử)', async () => {
    await extend();
    expect((await beat('an'))?.json().notices).toEqual([]);
  });

  it('Cộng giờ đến Người dự thi qua nhịp kế tiếp: hạn mới và thông báo kèm lý do', async () => {
    const first = (await beat('an'))?.json();
    t.clock.advance(minutes(1));
    await extend();
    const before = (await live.attemptRow('an')).deadline.getTime();
    const second = (await beat('an', { since: first.cursor }))?.json();
    expect(new Date(second.deadline).getTime()).toBe(before);
    expect(second.notices).toEqual([
      {
        id: expect.any(String),
        kind: 'time_extended',
        minutes: 15,
        reason: 'Mất điện',
        at: t.clock.now().toISOString(),
      },
    ]);
  });

  it('Cảnh cáo đến qua nhịp kế tiếp kèm lý do; Lượt khác không nhận', async () => {
    const first = (await beat('an'))?.json();
    t.clock.advance(minutes(1));
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      {
        action: 'warning',
        reason: 'Nhìn bài bạn',
      },
    );
    const notices = (await beat('an', { since: first.cursor }))?.json().notices;
    expect(notices).toEqual([
      {
        id: expect.any(String),
        kind: 'warning',
        reason: 'Nhìn bài bạn',
        at: t.clock.now().toISOString(),
      },
    ]);
    expect((await beat('binh', { since: first.cursor }))?.json().notices).toEqual([]);
  });

  it('thông báo cũ không lặp mãi: sau vài nhịp cursor đã vượt qua nó', async () => {
    const first = (await beat('an'))?.json();
    await extend();
    let cursor = first.cursor;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      t.clock.advance(15_000);
      const res = (await beat('an', { since: cursor }))?.json();
      seen.push(...res.notices.map((n: { id: string }) => n.id));
      cursor = res.cursor;
    }
    expect(new Set(seen).size).toBe(1); // cùng một thông báo (id ổn định để trình duyệt bỏ trùng)
    expect(seen.length).toBeLessThanOrEqual(2); // chỉ lặp trong khoảng chồng 5 giây
  });
});

describe('Lượt đã đóng và thiết bị', () => {
  it('Buộc nộp: nhịp kế tiếp báo đã nộp kèm lý do', async () => {
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.an],
    });
    const body = (await beat('an'))?.json();
    expect(body).toMatchObject({ status: 'submitted', submitReason: 'examiner', deviceOk: true });
  });

  it('quá hạn cộng ân hạn thì nhịp đóng Lượt với lý do hết giờ', async () => {
    t.clock.advance(minutes(45) + 31_000);
    expect((await beat('an'))?.json()).toMatchObject({
      status: 'submitted',
      submitReason: 'timeout',
    });
    expect((await live.attemptRow('an')).submit_reason).toBe('timeout');
  });

  it('Cộng giờ làm kịp trước khi hết hạn thì Lượt không bị đóng', async () => {
    t.clock.advance(minutes(44));
    await live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      attemptIds: [live.attemptIds.an],
      minutes: 10,
      reason: 'x',
      batchId: crypto.randomUUID(),
    });
    t.clock.advance(minutes(5));
    expect((await beat('an'))?.json().status).toBe('in_progress');
  });

  it('thiết bị bị Thu hồi: trả deviceOk=false, không ghi sự kiện, Lượt vẫn đang làm', async () => {
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/roster/${live.userIds.an}/revoke-device`,
      {},
    );
    const res = await beat('an', { events: [{ id: crypto.randomUUID(), type: 'tab_hidden' }] });
    expect(res?.statusCode).toBe(200);
    expect(res?.json()).toMatchObject({ status: 'in_progress', deviceOk: false });
    expect(await eventRows()).toHaveLength(0);
    expect((await live.attemptRow('an')).status).toBe('in_progress');
  });

  it('thiết bị lạ (không có cookie thiết bị) cũng deviceOk=false', async () => {
    const res = await live.takers.an?.call(
      'POST',
      `/take/attempts/${live.attemptIds.an}/heartbeat`,
      {},
      null,
    );
    expect(res?.json().deviceOk).toBe(false);
  });
});
