import { REALTIME_EVENT, REALTIME_JOIN, REALTIME_PATH, REALTIME_REDIS_CHANNEL } from '@exam/shared';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptSweepJob } from '../src/modules/attempt/attempt-sweep.job';
import { createTestApp, ORIGIN, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';

// S7 (Q213): kênh Socket.IO thật qua cổng đang nghe: xác thực lúc bắt tay, vào phòng, đẩy tin đến đúng phòng, gộp tin.

let t: TestApp;
let live: Awaited<ReturnType<typeof openLiveSession>>;
const open: Socket[] = [];
/** Khoảng gộp tin của môi trường test (vitest.config.ts); các lần chờ dưới đây suy ra từ đây. */
const THROTTLE_MS = Number(process.env.REALTIME_THROTTLE_MS);

beforeAll(async () => {
  t = await createTestApp({ listen: true });
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  await resetState();
  live = await openLiveSession(t);
  // Cho bộ gộp tin của phần chuẩn bị (start, join) chạy hết để không lẫn vào tin đang thử.
  await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS + 100));
});
afterEach(() => {
  for (const socket of open.splice(0)) socket.disconnect();
});

/** Kết nối như trình duyệt: cookie đăng nhập, cookie thiết bị (Người dự thi) và Origin. */
function connect(options: { cookie?: string; device?: string; origin?: string | null } = {}) {
  const cookies = [
    options.cookie ? `exam_sid=${options.cookie}` : '',
    options.device ? `exam_did=${options.device}` : '',
  ].filter(Boolean);
  const extraHeaders: Record<string, string> = {};
  if (cookies.length > 0) extraHeaders.cookie = cookies.join('; ');
  if (options.origin !== null) extraHeaders.origin = options.origin ?? ORIGIN;
  const socket = io(`http://127.0.0.1:${t.port}`, {
    path: REALTIME_PATH,
    transports: ['websocket'],
    extraHeaders,
    reconnection: false,
  });
  open.push(socket);
  return new Promise<Socket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

const join = (socket: Socket, event: string, payload: unknown) =>
  socket.timeout(2000).emitWithAck(event, payload) as Promise<{ ok: boolean }>;
const joinMonitor = (socket: Socket, sessionId = live.sessionId) =>
  join(socket, REALTIME_JOIN.monitor, { sessionId });
const joinAttempt = (socket: Socket, name: string) =>
  join(socket, REALTIME_JOIN.attempt, { attemptId: live.attemptIds[name] });
const candidate = (name: string) =>
  connect({ cookie: live.takers[name]?.cookie, device: live.takers[name]?.device });

/** Chờ một sự kiện, trả thời gian chờ (ms); hết hạn thì `null`. */
function waitFor(socket: Socket, event: string, within = 1500) {
  const started = performance.now();
  return new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      resolve(null);
    }, within);
    const on = () => {
      clearTimeout(timer);
      resolve(performance.now() - started);
    };
    socket.once(event, on);
  });
}
const count = (socket: Socket, event: string) => {
  const state = { n: 0 };
  socket.on(event, () => state.n++);
  return state;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('xác thực lúc bắt tay', () => {
  it('không có cookie đăng nhập thì bị từ chối', async () => {
    await expect(connect()).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it('cookie sai hoặc Origin lạ thì bị từ chối', async () => {
    await expect(connect({ cookie: 'khong-phai-phien' })).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(connect({ cookie: live.examiner, origin: 'http://evil.example' })).rejects.toThrow(
      /FORBIDDEN_ORIGIN/,
    );
    await expect(connect({ cookie: live.examiner, origin: null })).rejects.toThrow(
      /FORBIDDEN_ORIGIN/,
    );
  });

  it('người đã bị Khóa thì phiên không còn dùng được', async () => {
    await sql(`update users set status = 'locked' where id = $1`, [live.userIds.an]);
    await expect(candidate('an')).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

describe('vào phòng chỉ khi có quyền', () => {
  it('Người ra đề vào phòng Theo dõi của chính Phiên thi mình', async () => {
    const socket = await connect({ cookie: live.examiner });
    expect(await joinMonitor(socket)).toEqual({ ok: true });
  });

  it('Người ra đề khác, Người dự thi, mã Phiên thi lạ hoặc sai dạng thì không vào được', async () => {
    const other = await connect({ cookie: live.other });
    expect(await joinMonitor(other)).toEqual({ ok: false });
    const taker = await candidate('an');
    expect(await joinMonitor(taker)).toEqual({ ok: false });
    const owner = await connect({ cookie: live.examiner });
    expect(await joinMonitor(owner, crypto.randomUUID())).toEqual({ ok: false });
    expect(await join(owner, REALTIME_JOIN.monitor, { sessionId: 'abc' })).toEqual({ ok: false });
    expect(await join(owner, REALTIME_JOIN.monitor, null)).toEqual({ ok: false });
  });

  it('Người dự thi vào phòng Lượt của mình trên đúng thiết bị', async () => {
    expect(await joinAttempt(await candidate('an'), 'an')).toEqual({ ok: true });
  });

  it('không vào được Lượt của người khác, bằng thiết bị lạ, hay bằng tài khoản Người ra đề', async () => {
    expect(await joinAttempt(await candidate('binh'), 'an')).toEqual({ ok: false });
    const wrongDevice = await connect({ cookie: live.takers.an?.cookie, device: 'may-la' });
    expect(await joinAttempt(wrongDevice, 'an')).toEqual({ ok: false });
    const noDevice = await connect({ cookie: live.takers.an?.cookie });
    expect(await joinAttempt(noDevice, 'an')).toEqual({ ok: false });
    const examiner = await connect({ cookie: live.examiner });
    expect(await joinAttempt(examiner, 'an')).toEqual({ ok: false });
  });
});

describe('đẩy sớm cho Người dự thi (attempt.nudge)', () => {
  const extend = (names: string[]) =>
    live.api('POST', `/sessions/${live.sessionId}/extend-time`, {
      attemptIds: names.map((name) => live.attemptIds[name]),
      minutes: 5,
      reason: 'Mất điện',
      batchId: crypto.randomUUID(),
    });

  it('Cộng giờ đẩy tới đúng Lượt trong dưới 1 giây; Lượt khác không nhận', async () => {
    const an = await candidate('an');
    const binh = await candidate('binh');
    await joinAttempt(an, 'an');
    await joinAttempt(binh, 'binh');
    const anGot = waitFor(an, REALTIME_EVENT.attemptNudge);
    const binhGot = count(binh, REALTIME_EVENT.attemptNudge);
    expect((await extend(['an'])).statusCode).toBe(200);
    const took = await anGot;
    console.info(`Cộng giờ → Người dự thi nhận tin: ${took?.toFixed(0)} ms`);
    expect(took, 'Người dự thi phải nhận được tin đẩy').not.toBeNull();
    expect(took as number).toBeLessThan(1000);
    await sleep(200);
    expect(binhGot.n).toBe(0);
  });

  it('Buộc nộp, Cảnh cáo, Đình chỉ, Thu hồi và Hoàn tác Thu hồi đều đẩy tới Lượt bị tác động', async () => {
    const an = await candidate('an');
    await joinAttempt(an, 'an');
    const nudged = count(an, REALTIME_EVENT.attemptNudge);
    const expectNudge = async (act: () => Promise<{ statusCode: number }>, label: string) => {
      const before = nudged.n;
      expect((await act()).statusCode, label).toBeLessThan(300);
      await sleep(150);
      expect(nudged.n, label).toBeGreaterThan(before);
    };
    const warn = () =>
      live.api('POST', `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`, {
        action: 'warning',
        reason: 'x',
      });
    await expectNudge(warn, 'Cảnh cáo');
    await expectNudge(
      () =>
        live.api('POST', `/sessions/${live.sessionId}/roster/${live.userIds.an}/revoke-device`, {}),
      'Thu hồi',
    );
    const deviceId = (await live.api('GET', `/sessions/${live.sessionId}/monitor`))
      .json()
      .people.find((p: { userId: string }) => p.userId === live.userIds.an).revokedDeviceId;
    await expectNudge(
      () =>
        live.api('POST', `/sessions/${live.sessionId}/roster/${live.userIds.an}/pardon-device`, {
          deviceId,
        }),
      'Hoàn tác Thu hồi',
    );
    await expectNudge(
      () =>
        live.api('POST', `/sessions/${live.sessionId}/force-submit`, {
          attemptIds: [live.attemptIds.an],
        }),
      'Buộc nộp',
    );
  });

  it('Hủy Phiên thi đẩy tới mọi Lượt đang làm, để Người dự thi biết ngay Lượt đã đóng', async () => {
    const an = await candidate('an');
    const binh = await candidate('binh');
    await joinAttempt(an, 'an');
    await joinAttempt(binh, 'binh');
    const got = [
      waitFor(an, REALTIME_EVENT.attemptNudge),
      waitFor(binh, REALTIME_EVENT.attemptNudge),
    ];
    expect((await live.api('POST', `/sessions/${live.sessionId}/cancel`, {})).statusCode).toBe(200);
    expect(await Promise.all(got)).not.toContain(null);
  });

  it('Lượt đã nộp thì không vào phòng được nữa', async () => {
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`);
    expect(await joinAttempt(await candidate('an'), 'an')).toEqual({ ok: false });
  });

  it('Đình chỉ đẩy tới Lượt bị đình chỉ', async () => {
    const an = await candidate('an');
    await joinAttempt(an, 'an');
    const got = waitFor(an, REALTIME_EVENT.attemptNudge);
    await live.api(
      'POST',
      `/sessions/${live.sessionId}/attempts/${live.attemptIds.an}/violations`,
      {
        action: 'disqualify',
        reason: 'Dùng tài liệu',
      },
    );
    expect(await got).not.toBeNull();
  });
});

describe('đẩy cho Người ra đề (monitor.changed), gộp theo khoảng', () => {
  const beat = (name: string) =>
    live.takers[name]?.call('POST', `/take/attempts/${live.attemptIds[name]}/heartbeat`, {});

  it('nhịp của Người dự thi báo ngay cho màn Theo dõi, dưới 1 giây', async () => {
    const examiner = await connect({ cookie: live.examiner });
    await joinMonitor(examiner);
    const got = waitFor(examiner, REALTIME_EVENT.monitorChanged);
    await beat('an');
    const took = await got;
    console.info(`Heartbeat → màn Theo dõi nhận tin: ${took?.toFixed(0)} ms`);
    expect(took, 'Người ra đề phải nhận được tin').not.toBeNull();
    expect(took as number).toBeLessThan(1000);
  });

  it('Lưu bài và nộp bài cũng báo cho màn Theo dõi', async () => {
    const examiner = await connect({ cookie: live.examiner });
    await joinMonitor(examiner);
    const view = (
      await live.takers.an?.call('GET', `/take/attempts/${live.attemptIds.an}`)
    )?.json();
    const item = view.sections[0].items[0].itemId;
    const acts = {
      'Lưu bài': () =>
        live.takers.an?.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
          items: [{ itemId: item, clientSeq: 1, value: { optionId: 'o1' } }],
        }),
      'Nộp bài': () => live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/submit`),
    };
    for (const [label, act] of Object.entries(acts)) {
      await sleep(THROTTLE_MS + 50); // qua khoảng gộp để lần sau chạy ngay
      const got = waitFor(examiner, REALTIME_EVENT.monitorChanged);
      const res = await act();
      expect(res?.statusCode, label).toBe(200);
      expect(await got, label).not.toBeNull();
    }
  });

  it('50 nhịp dồn dập chỉ thành vài tin: lần đầu ngay, phần còn lại gộp ở cuối khoảng', async () => {
    const examiner = await connect({ cookie: live.examiner });
    await joinMonitor(examiner);
    const got = count(examiner, REALTIME_EVENT.monitorChanged);
    await Promise.all(Array.from({ length: 50 }, () => beat('an')));
    await sleep(800);
    expect(got.n).toBeGreaterThanOrEqual(1);
    expect(got.n).toBeLessThanOrEqual(3);
  });

  it('Người ra đề chưa vào phòng thì không nhận gì', async () => {
    const examiner = await connect({ cookie: live.examiner });
    const got = count(examiner, REALTIME_EVENT.monitorChanged);
    await beat('an');
    await sleep(400);
    expect(got.n).toBe(0);
  });
});

describe('đường từ tiến trình khác (worker) qua Redis', () => {
  it('job quét tự nộp báo cho màn Theo dõi', async () => {
    const examiner = await connect({ cookie: live.examiner });
    await joinMonitor(examiner);
    t.clock.advance(minutes(46));
    const got = waitFor(examiner, REALTIME_EVENT.monitorChanged);
    expect(await t.app.get(AttemptSweepJob).run()).toBe(3);
    expect(await got).not.toBeNull();
  });

  it('tin đăng thẳng lên kênh Redis (như tiến trình khác) được chuyển đúng phòng', async () => {
    const examiner = await connect({ cookie: live.examiner });
    await joinMonitor(examiner);
    const an = await candidate('an');
    await joinAttempt(an, 'an');
    const redis = new Redis(process.env.REDIS_URL as string);
    try {
      const monitor = waitFor(examiner, REALTIME_EVENT.monitorChanged);
      const nudge = waitFor(an, REALTIME_EVENT.attemptNudge);
      await redis.publish(
        REALTIME_REDIS_CHANNEL,
        JSON.stringify({ t: 'session', id: live.sessionId }),
      );
      await redis.publish(
        REALTIME_REDIS_CHANNEL,
        JSON.stringify({ t: 'attempt', id: live.attemptIds.an }),
      );
      await redis.publish(REALTIME_REDIS_CHANNEL, 'không phải JSON'); // tin hỏng bị bỏ qua, không làm sập cổng
      expect(await monitor).not.toBeNull();
      expect(await nudge).not.toBeNull();
    } finally {
      redis.disconnect();
    }
  });
});

describe('phát tán và hiệu năng (ngân sách: tin đến mọi người dưới 500 ms)', () => {
  it('300 kết nối cùng nghe một phòng đều nhận tin trong thời gian ngắn', async () => {
    const sockets = await Promise.all(
      Array.from({ length: 300 }, () => connect({ cookie: live.examiner })),
    );
    expect((await Promise.all(sockets.map((s) => joinMonitor(s)))).every((a) => a.ok)).toBe(true);
    const started = performance.now();
    const all = Promise.all(sockets.map((s) => waitFor(s, REALTIME_EVENT.monitorChanged, 3000)));
    await live.takers.an?.call('POST', `/take/attempts/${live.attemptIds.an}/heartbeat`, {});
    const times = (await all) as (number | null)[];
    const last = Math.max(...times.map((time) => time ?? Number.POSITIVE_INFINITY));
    console.info(
      `Phát tán monitor.changed tới 300 kết nối: kết nối cuối nhận sau ${last.toFixed(0)} ms (tổng ${(performance.now() - started).toFixed(0)} ms)`,
    );
    expect(times.every((time) => time !== null)).toBe(true);
    expect(last).toBeLessThan(500);
  });
});
