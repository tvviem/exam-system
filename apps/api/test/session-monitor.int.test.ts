import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { login } from './support/http';
import { leaks } from './support/leaks';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { Taker } from './support/take';
import { DEFAULT_PASSWORD } from './support/users';

// S2/S8 (Q252, Q253, Q261): GET /sessions/:id/monitor qua HTTP + PostgreSQL + Redis thật.

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

interface Person {
  userId: string;
  code: string;
  fullName: string;
  state: string;
  attemptId: string | null;
  answered: number;
  hiddenCount: number;
  warnings: number;
  device: string;
  revokedDeviceId: string | null;
  reasons: string[];
  submitReason: string | null;
  deadline: string | null;
}
const monitor = async (who = live.examiner) => {
  const res = await live.api('GET', `/sessions/${live.sessionId}/monitor`, undefined, who);
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    serverNow: string;
    entryClosed: boolean;
    totalItems: number;
    summary: Record<string, number>;
    people: Person[];
  };
};
const person = async (name: string) =>
  (await monitor()).people.find((p) => p.userId === live.userIds[name]) as Person;
const beat = (name: string, body: Record<string, unknown> = {}) =>
  live.takers[name]?.call('POST', `/take/attempts/${live.attemptIds[name]}/heartbeat`, body);

describe('trạng thái từng người và tổng hợp', () => {
  it('người đang làm, người chưa vào, tổng số câu; sắp theo tên gọi', async () => {
    const body = await monitor();
    expect(body.totalItems).toBe(4);
    expect(body.serverNow).toBe(t.clock.now().toISOString());
    expect(body.summary).toEqual({
      total: 4,
      notStarted: 1,
      working: 3,
      disconnected: 0,
      submitted: 0,
      suspended: 0,
      attention: 0,
      undoable: 0,
    });
    const dung = body.people.find((p) => p.userId === live.userIds.dung);
    expect(dung).toMatchObject({
      state: 'not_started',
      attemptId: null,
      answered: 0,
      device: 'none',
    });
    const an = body.people.find((p) => p.userId === live.userIds.an);
    expect(an).toMatchObject({
      state: 'working',
      attemptId: live.attemptIds.an,
      code: 'SV001',
      device: 'ok',
      reasons: [],
    });
    expect(new Date(an?.deadline as string).getTime()).toBe(
      (await live.attemptRow('an')).deadline.getTime(),
    );
    expect(body.people).toHaveLength(4);
  });

  it('quá 45 giây không có nhịp thì mất kết nối; có nhịp thì làm tiếp', async () => {
    t.clock.advance(46_000);
    let body = await monitor();
    expect(body.summary).toMatchObject({ working: 0, disconnected: 3, attention: 3 });
    expect((await person('an')).reasons).toEqual(['disconnected']);

    await beat('an');
    body = await monitor();
    expect(body.summary).toMatchObject({ working: 1, disconnected: 2 });
    expect((await person('an')).state).toBe('working');
  });

  it('đếm câu đã trả lời: bỏ trả lời và trả lời rỗng không tính', async () => {
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    const byType = Object.fromEntries(
      view.sections[0].items.map((i: { type: string; itemId: string }) => [i.type, i.itemId]),
    );
    const save = (items: unknown[]) =>
      live.takers.an?.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, { items });
    await save([
      { itemId: byType.single_choice, clientSeq: 1, value: { optionId: 'o1' } },
      { itemId: byType.multiple_choice, clientSeq: 1, value: { optionIds: [] } },
      { itemId: byType.essay, clientSeq: 1, value: { text: '' } },
    ]);
    expect((await person('an')).answered).toBe(1);
    await save([
      { itemId: byType.multiple_choice, clientSeq: 2, value: { optionIds: ['o1'] } },
      { itemId: byType.essay, clientSeq: 2, value: { text: 'bài làm' } },
      { itemId: byType.single_choice, clientSeq: 2, value: null },
    ]);
    expect((await person('an')).answered).toBe(2); // chọn một đã bỏ lại
  });

  it('đếm số lần rời màn hình và Cảnh cáo; ba lần rời màn hình thì Cần chú ý', async () => {
    const hidden = () => ({ id: crypto.randomUUID(), type: 'tab_hidden' });
    await beat('an', {
      events: [hidden(), { id: crypto.randomUUID(), type: 'tab_visible' }, hidden()],
    });
    expect(await person('an')).toMatchObject({ hiddenCount: 2, reasons: [] });
    await beat('an', { events: [hidden()] });
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      {
        action: 'warning',
        reason: 'Nhìn bài bạn',
      },
    );
    expect(await person('an')).toMatchObject({ hiddenCount: 3, warnings: 1, reasons: ['hidden'] });
    expect((await monitor()).summary.attention).toBe(1);
  });

  it('làm chậm: qua 25% thời gian mà tiến độ thấp hơn mức mong đợi quá 30 điểm', async () => {
    t.clock.advance(minutes(30)); // 30 / 45 = 66,7% thời gian, ngưỡng 36,7% số câu
    for (const name of ['an', 'binh', 'chi']) await beat(name);
    const body = await monitor();
    expect(
      body.people
        .filter((p) => p.reasons.includes('slow'))
        .map((p) => p.code)
        .sort(),
    ).toEqual(['SV001', 'SV002', 'SV003']);
    // An trả lời 2/4 = 50% > 36,7% thì không bị coi là chậm.
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    const [first, second] = view.sections[0].items as { itemId: string }[];
    await live.takers.an?.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
      items: [
        { itemId: first?.itemId, clientSeq: 1, value: { optionId: 'o1' } },
        { itemId: second?.itemId, clientSeq: 1, value: { optionIds: ['o1'] } },
      ],
    });
    expect((await person('an')).reasons).toEqual([]);
  });

  it('Cộng giờ làm hạn dài ra và ngưỡng làm chậm nới theo', async () => {
    t.clock.advance(minutes(30));
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    await live.takers.an?.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
      items: [
        { itemId: view.sections[0].items[0].itemId, clientSeq: 1, value: { optionId: 'o1' } },
      ],
    }); // 1/4 = 25% câu, thấp hơn mức mong đợi 36,7% sau 30/45 phút
    await beat('an');
    expect((await person('an')).reasons).toEqual(['slow']);
    await live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      attemptIds: [live.attemptIds.an],
      minutes: 45,
      reason: 'Mất điện',
      batchId: crypto.randomUUID(),
    });
    expect((await person('an')).reasons).toEqual([]);
  });
});

describe('Lượt đã đóng', () => {
  it('nộp bài, Buộc nộp và Đình chỉ có trạng thái và lý do khác nhau', async () => {
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      attemptIds: [live.attemptIds.binh],
    });
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.chi}/violations`,
      {
        action: 'disqualify',
        reason: 'Dùng tài liệu',
      },
    );
    expect(await person('an')).toMatchObject({ state: 'submitted', submitReason: 'candidate' });
    expect(await person('binh')).toMatchObject({ state: 'submitted', submitReason: 'examiner' });
    expect(await person('chi')).toMatchObject({ state: 'suspended', submitReason: 'disqualified' });
    expect((await monitor()).summary).toMatchObject({ working: 0, submitted: 2, suspended: 1 });
  });

  it('Lượt đã nộp không còn dấu hiệu Cần chú ý dù im lặng lâu', async () => {
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    t.clock.advance(minutes(10));
    expect((await person('an')).reasons).toEqual([]);
  });

  it('người làm Lượt thứ hai: hiện Lượt mới nhất', async () => {
    await sql(`update sessions set max_attempts = 2 where id = $1`, [live.sessionId]);
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    const view = (
      await live.takers.an?.call('POST', `/take/sessions/${live.sessionId}/start`)
    )?.json();
    const an = await person('an');
    expect(an.state).toBe('working');
    expect(an.attemptId).toBe(view.attempt.id);
  });
});

describe('thiết bị', () => {
  it('bị Thu hồi: device=revoked và Cần chú ý; Hoàn tác Thu hồi thì trở lại bình thường', async () => {
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/roster/${live.userIds.an}/revoke-device`,
      {},
    );
    expect(await person('an')).toMatchObject({ device: 'revoked', reasons: ['device'] });
    // Màn Theo dõi cho biết thiết bị nào để Hoàn tác Thu hồi, không phải đọc cả Danh sách dự thi.
    const deviceId = (await person('an')).revokedDeviceId;
    expect(deviceId).toEqual(expect.any(String));
    expect((await person('binh')).revokedDeviceId).toBeNull();
    await live.api('POST', `/sessions/${live.sessionId}/roster/${live.userIds.an}/pardon-device`, {
      deviceId,
    });
    expect(await person('an')).toMatchObject({ device: 'ok', reasons: [] });
  });

  it('thiết bị mới sau khi bắt đầu: device=new và Cần chú ý', async () => {
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/roster/${live.userIds.an}/revoke-device`,
      {},
    );
    t.clock.advance(minutes(2));
    const phone = await Taker.signIn(t, 'an');
    expect((await phone.join('AB3K9X')).statusCode).toBe(200);
    await phone.call('POST', `/take/attempts/${live.attemptIds.an}/heartbeat`, {});
    expect(await person('an')).toMatchObject({ device: 'new', reasons: ['device'] });
  });
});

describe('quyền và bất biến', () => {
  it('chỉ chủ Phiên thi: người khác 404, Người dự thi 403; Phiên thi đã hủy vẫn xem được', async () => {
    expect(
      (await live.api('GET', `/sessions/${live.sessionId}/monitor`, undefined, live.other))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await live.api(
          'GET',
          `/sessions/${live.sessionId}/monitor`,
          undefined,
          live.takers.an?.cookie,
        )
      ).statusCode,
    ).toBe(403);
    await live.api('POST', `/sessions/${live.sessionId}/cancel`, {});
    const body = await monitor();
    expect(body.summary).toMatchObject({ submitted: 3 });
  });

  it('cho biết cửa vào thi đã đóng hay chưa để màn Theo dõi hiện đúng nút Đóng hoặc Mở lại', async () => {
    expect((await monitor()).entryClosed).toBe(false);
    await live.api('POST', `/sessions/${live.sessionId}/close-entry`, {});
    expect((await monitor()).entryClosed).toBe(true);
    await live.api('POST', `/sessions/${live.sessionId}/reopen-entry`, {});
    expect((await monitor()).entryClosed).toBe(false);
  });

  it('Người ra đề mất máy: đăng nhập thiết bị khác vẫn thấy đủ trạng thái; Người dự thi không bị ảnh hưởng', async () => {
    await beat('an', { events: [{ id: crypto.randomUUID(), type: 'tab_hidden' }] });
    const before = await monitor();
    const second = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
    expect(second).not.toBe(live.examiner);
    expect(await monitor(second)).toEqual(before);
    // Máy cũ của Người ra đề bị đăng xuất hoặc mất mạng: Người dự thi vẫn nhịp và lưu được.
    expect((await beat('binh'))?.statusCode).toBe(200);
  });

  it('không mang đáp án hay quy tắc chấm (S8)', async () => {
    expect(leaks(await monitor())).toEqual([]);
  });

  it('Phiên thi chưa có ai trong Danh sách thì trả danh sách rỗng', async () => {
    await sql(`delete from responses; delete from session_events;`);
    const empty = await live.api('POST', '/sessions', {
      examId: (await sql<{ exam_id: string }>(`select exam_id from sessions limit 1`))[0]?.exam_id,
      title: 'Ca 2',
      opensAt: '2026-11-03T07:00:00+07:00',
      closesAt: '2026-11-03T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: 'ZZ9K3X',
    });
    const res = await live.api('GET', `/sessions/${empty.json().id}/monitor`);
    expect(res.json().people).toEqual([]);
    expect(res.json().summary.total).toBe(0);
  });
});

describe('hiệu năng với 500 người (ngân sách: p95 ≤ 100 ms)', () => {
  it('đọc monitor của Phiên thi 500 người, 450 đang làm, mỗi người vài câu trả lời', async () => {
    await sql(
      `insert into users (id, username, code, full_name, password_hash, class_label)
       select gen_random_uuid(), 'bulk' || g, 'B' || lpad(g::text, 4, '0'), 'Sinh viên ' || g, 'x', 'K65-' || (g % 10)
       from generate_series(1, 500) g`,
    );
    await sql(
      `insert into user_role_tags (user_id, tag) select id, 'candidate' from users where username like 'bulk%'`,
    );
    await sql(
      `insert into session_roster (session_id, user_id, added_by)
       select $1, id, (select owner_id from sessions where id = $1) from users where username like 'bulk%'`,
      [live.sessionId],
    );
    await sql(
      `insert into attempts (id, session_id, user_id, attempt_no, seed, layout, started_at, deadline)
       select gen_random_uuid(), $1, u.id, 1, 1, '{"sections":[]}'::jsonb, $2::timestamptz, $2::timestamptz + interval '45 minutes'
       from users u where u.username like 'bulk%' and u.code < 'B0451'`,
      [live.sessionId, t.clock.now()],
    );
    await sql(
      `insert into responses (attempt_id, item_id, value, client_seq, saved_at)
       select a.id, ei.id, '{"optionId":"o1"}'::jsonb, 1, now()
       from attempts a join users u on u.id = a.user_id
       join sessions s on s.id = a.session_id join exam_items ei on ei.exam_id = s.exam_id
       where u.username like 'bulk%'`,
    );
    await sql(
      `insert into session_events (session_id, user_id, attempt_id, type)
       select a.session_id, a.user_id, a.id, 'tab_hidden' from attempts a
       join users u on u.id = a.user_id where u.username like 'bulk%'`,
    );
    await monitor(); // làm nóng
    const timings: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const body = await monitor();
      timings.push(performance.now() - start);
      expect(body.people).toHaveLength(504);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1] as number;
    console.info(`monitor 504 người: p50 ${timings[4]?.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
    expect(p95).toBeLessThan(100);

    // Heartbeat (ngân sách p95 ≤ 30 ms).
    const beats: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await beat('an', { events: [{ id: crypto.randomUUID(), type: 'tab_visible' }] });
      beats.push(performance.now() - start);
      expect(res?.statusCode).toBe(200);
    }
    beats.sort((a, b) => a - b);
    const beatP95 = beats[Math.ceil(beats.length * 0.95) - 1] as number;
    console.info(`heartbeat: p50 ${beats[9]?.toFixed(0)} ms, p95 ${beatP95.toFixed(0)} ms`);
    expect(beatP95).toBeLessThan(30);

    // Cộng giờ và Buộc nộp cho cả phòng (ngân sách ≤ 300 ms).
    const extendStart = performance.now();
    const extended = await live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      scope: 'all',
      minutes: 15,
      reason: 'Mất điện',
      batchId: crypto.randomUUID(),
    });
    const extendMs = performance.now() - extendStart;
    expect(extended.json().extended).toBe(453);
    const forceStart = performance.now();
    const forced = await live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
      scope: 'all',
    });
    const forceMs = performance.now() - forceStart;
    expect(forced.json().closed).toBe(453);
    console.info(
      `Cộng giờ cả phòng: ${extendMs.toFixed(0)} ms, Buộc nộp cả phòng: ${forceMs.toFixed(0)} ms`,
    );
    expect(extendMs).toBeLessThan(300);
    expect(forceMs).toBeLessThan(300);
  });
});
