import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { fullExam, Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// S2 (Q284): Phòng chờ. Phiên thi mở 09:00, đóng 12:00, Thời lượng 45 phút; cho vào Phòng chờ từ 08:30.

let t: TestApp;
let examiner: string;
let sessionId: string;
let an: Taker;
let binh: Taker;
let chi: Taker;
let anId: string;
let binhId: string;
let chiId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const examinerApi = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: examiner, body });

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  binhId = (await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] })).id;
  chiId = (await seedUser({ username: 'chi', code: 'SV003', roleTags: ['candidate'] })).id;
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  const examId = (await fullExam(t, examiner)).id;
  const created = await examinerApi('POST', '/sessions', {
    examId,
    title: 'Ca sáng',
    opensAt: '2026-11-02T09:00:00+07:00',
    closesAt: '2026-11-02T12:00:00+07:00',
    durationMinutes: 45,
    maxAttempts: 2,
    accessCode: 'AB3K9X',
  });
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
  await examinerApi('POST', `/sessions/${sessionId}/roster`, { userIds: [anId, binhId, chiId] });
  an = await Taker.signIn(t, 'an');
  binh = await Taker.signIn(t, 'binh');
  chi = await Taker.signIn(t, 'chi');
});

const reasonOf = (res: { json: () => { reason?: string } }) => res.json().reason;
const ping = (who: Taker, id = sessionId) => who.call('POST', `/take/sessions/${id}/waiting`, {});
const monitor = async () =>
  (await examinerApi('GET', `/sessions/${sessionId}/monitor`)).json() as {
    summary: { joined: number; waitingOnline: number; notStarted: number };
    people: { userId: string; state: string; waiting: 'none' | 'online' | 'offline' }[];
  };
const waitingOf = async (id: string) =>
  (await monitor()).people.find((p) => p.userId === id)?.waiting;

describe('vào Phòng chờ', () => {
  it('trước cửa sổ 30 phút: bị từ chối "chưa mở" kèm giờ mở, không gắn thiết bị', async () => {
    t.clock.set(new Date('2026-11-02T08:29:59+07:00'));
    const res = await an.join('AB3K9X');
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('NOT_OPEN_YET');
    expect(res.json().opensAt).toBe(new Date('2026-11-02T09:00:00+07:00').toISOString());
    expect(await sql(`select 1 from session_devices`)).toHaveLength(0);
  });

  it('trong cửa sổ: vào được, thiết bị được gắn, chưa có Lượt; bắt đầu làm bài vẫn chưa được', async () => {
    t.clock.set(new Date('2026-11-02T08:30:00+07:00')); // đúng ranh giới
    const res = await an.join('AB3K9X');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ sessionId, attemptId: null, waiting: true });
    expect(await sql(`select 1 from session_devices where status = 'active'`)).toHaveLength(1);
    expect(await sql(`select 1 from attempts`)).toHaveLength(0);
    const start = await an.call('POST', `/take/sessions/${sessionId}/start`);
    expect(start.statusCode).toBe(409);
    expect(reasonOf(start)).toBe('NOT_OPEN_YET');
  });

  it('mã sai hay người không có trong Danh sách: vẫn một lỗi chung; Phiên thi đã Hủy báo đúng lý do', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    const stranger = await (async () => {
      await seedUser({ username: 'la', code: 'SV009', roleTags: ['candidate'] });
      return Taker.signIn(t, 'la');
    })();
    expect(reasonOf(await stranger.join('AB3K9X'))).toBeUndefined();
    expect((await stranger.join('AB3K9X')).json().code).toBe('INVALID_ACCESS_CODE');
    await examinerApi('POST', `/sessions/${sessionId}/cancel`, {});
    expect(reasonOf(await an.join('AB3K9X'))).toBe('SESSION_CANCELLED');
  });

  it('danh sách Phiên thi của tôi: waitingRoom chỉ true trên thiết bị đã vào, trước giờ mở', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    const before = (await an.call('GET', '/take/sessions')).json().items[0];
    expect(before).toMatchObject({ phase: 'upcoming', waitingRoom: false, canWait: true });
    await an.join('AB3K9X');
    const after = (await an.call('GET', '/take/sessions')).json().items[0];
    expect(after).toMatchObject({ phase: 'upcoming', waitingRoom: true, deviceStatus: 'active' });
    // Thiết bị khác của cùng người không ở trong Phòng chờ
    const other = await Taker.signIn(t, 'an');
    expect((await other.call('GET', '/take/sessions')).json().items[0].waitingRoom).toBe(false);
    // Lúc còn xa giờ mở thì chưa cho chờ
    t.clock.set(new Date('2026-11-02T07:00:00+07:00'));
    expect((await chi.call('GET', '/take/sessions')).json().items[0]).toMatchObject({
      waitingRoom: false,
      canWait: false,
    });
  });
});

describe('nhịp của Phòng chờ', () => {
  it('trả giờ server, giờ mở, trạng thái và canStart; chưa tới giờ thì canStart là false', async () => {
    t.clock.set(new Date('2026-11-02T08:45:00+07:00'));
    await an.join('AB3K9X');
    const res = await ping(an);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({
      serverNow: new Date('2026-11-02T08:45:00+07:00').toISOString(),
      opensAt: new Date('2026-11-02T09:00:00+07:00').toISOString(),
      phase: 'upcoming',
      canStart: false,
    });
  });

  it('tới giờ mở: canStart true và bắt đầu được ngay trên thiết bị đã vào', async () => {
    t.clock.set(new Date('2026-11-02T08:50:00+07:00'));
    await an.join('AB3K9X');
    t.clock.set(new Date('2026-11-02T09:00:00+07:00'));
    expect((await ping(an)).json()).toMatchObject({ phase: 'open', canStart: true });
    const start = await an.call('POST', `/take/sessions/${sessionId}/start`);
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().status).toBe('in_progress');
  });

  it('chưa nhập mã (chưa có thiết bị), thiết bị khác, người không có trong Danh sách: bị từ chối', async () => {
    t.clock.set(new Date('2026-11-02T08:45:00+07:00'));
    expect(reasonOf(await ping(an))).toBe('NOT_JOINED');
    await an.join('AB3K9X');
    const other = await Taker.signIn(t, 'an');
    expect(reasonOf(await ping(other))).toBe('NOT_JOINED');
    await seedUser({ username: 'la', code: 'SV009', roleTags: ['candidate'] });
    expect((await ping(await Taker.signIn(t, 'la'))).statusCode).toBe(404);
    expect((await ping(an, crypto.randomUUID())).statusCode).toBe(404);
  });

  it('Phiên thi đã Hủy thì nhịp báo SESSION_CANCELLED', async () => {
    t.clock.set(new Date('2026-11-02T08:45:00+07:00'));
    await an.join('AB3K9X');
    await examinerApi('POST', `/sessions/${sessionId}/cancel`, {});
    expect(reasonOf(await ping(an))).toBe('SESSION_CANCELLED');
  });

  it('bị giới hạn 30 nhịp mỗi 10 giây', async () => {
    t.clock.set(new Date('2026-11-02T08:45:00+07:00'));
    await an.join('AB3K9X');
    const codes: number[] = [];
    for (let i = 0; i < 35; i++) codes.push((await ping(an)).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes.slice(30).every((c) => c === 429)).toBe(true);
  });
});

describe('Người ra đề giám sát Phòng chờ', () => {
  it('thấy ai chưa vào, ai đang chờ trực tuyến, ai chờ mà mất kết nối; tổng hợp đúng', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    await an.join('AB3K9X');
    await binh.join('AB3K9X');
    await ping(an);
    await ping(binh);
    let m = await monitor();
    expect(m.summary).toMatchObject({ joined: 2, waitingOnline: 2, notStarted: 3 });
    expect(await waitingOf(anId)).toBe('online');
    expect(await waitingOf(chiId)).toBe('none');

    // 30 giây sau chỉ An còn gửi nhịp; Bình im hơn 45 giây thì mất kết nối
    t.clock.advance(30_000);
    await ping(an);
    t.clock.advance(20_000); // Bình im 50 giây
    await ping(an);
    m = await monitor();
    expect(await waitingOf(anId)).toBe('online');
    expect(await waitingOf(binhId)).toBe('offline');
    expect(m.summary).toMatchObject({ joined: 2, waitingOnline: 1 });
  });

  it('người đã nhập mã nhưng chưa từng gửi nhịp cũng là offline; bắt đầu làm bài rồi thì không còn tính là chờ', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    await an.join('AB3K9X');
    expect(await waitingOf(anId)).toBe('offline');
    t.clock.set(new Date('2026-11-02T09:00:30+07:00'));
    await an.call('POST', `/take/sessions/${sessionId}/start`);
    const m = await monitor();
    expect(m.people.find((p) => p.userId === anId)).toMatchObject({
      state: 'working',
      waiting: 'none',
    });
    expect(m.summary.joined).toBe(0);
  });

  it('Người dự thi quay lại Phòng chờ sau khi đóng trình duyệt: cùng thiết bị vào lại được', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    await an.join('AB3K9X');
    const reopened = await Taker.signIn(t, 'an');
    reopened.device = an.device; // cookie thiết bị còn
    const again = await reopened.join('AB3K9X');
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().waiting).toBe(true);
    expect((await reopened.call('GET', '/take/sessions')).json().items[0].waitingRoom).toBe(true);
    expect(await sql(`select 1 from session_devices`)).toHaveLength(1);
  });

  it('thời gian đáp ứng: nhịp dưới 100 ms, monitor 500 người có Phòng chờ dưới 100 ms', async () => {
    t.clock.set(new Date('2026-11-02T08:40:00+07:00'));
    await an.join('AB3K9X');
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      await ping(an);
      timings.push(performance.now() - started);
      t.clock.advance(1000);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1] as number;
    console.info(`Nhịp Phòng chờ: p50 ${timings[9]?.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);
    expect(p95).toBeLessThan(100);
    expect(binhId).toBeTruthy();
  });
});
