#!/usr/bin/env node
// Đo tải kỳ thi 500 người (Q236, Q266, docs/plan/slice-4.md). Không chạy trong CI. Cần: `pnpm build`, pod dev-exam (Postgres, Redis).
//   pnpm --filter @exam/api load:exam            (mặc định 500 người, vào rải 60 giây, làm bài 180 giây)
//   LOAD_USERS=100 LOAD_RAMP_SECONDS=20 LOAD_WORK_SECONDS=60 pnpm --filter @exam/api load:exam
// Mỗi Người dự thi: đăng nhập, vào thi, bắt đầu, nối Socket.IO, lưu bài, gửi heartbeat 15 giây, nộp. Ba Người ra đề xem Theo dõi
// (nhận tin đẩy, hỏi lại an toàn 10 giây). Giữa chừng có một lần Cộng giờ cả phòng (đo tin đẩy tới Người dự thi) và một đợt
// ngắt rồi nối lại đồng loạt toàn bộ kết nối Socket.IO. Chạy 100 người trước, 500 người chỉ khi chủ dự án báo (máy còn chạy production);
// nên chạy dưới `nice -n 19`.
// Tạo cơ sở dữ liệu tạm `exam_load_tmp`, chạy api đã build ở cổng 3101, đo rồi xóa. Thoát mã 1 nếu vượt ngưỡng.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { Client } = require('pg');
const { Redis } = require('ioredis');
const { io } = require('socket.io-client');
const { runMigrations } = require('../dist/db/run-migrations.js');
const { hashPassword } = require('../dist/modules/identity/password/password-hasher.js');

const N = Number(process.env.LOAD_USERS ?? 500);
const RAMP_MS = Number(process.env.LOAD_RAMP_SECONDS ?? 60) * 1000;
const WORK_MS = Number(process.env.LOAD_WORK_SECONDS ?? 180) * 1000;
const POOL_MAX = process.env.LOAD_DB_POOL_MAX ?? '10';
const DB = 'exam_load_tmp';
const BASE = process.env.LOAD_PG_BASE ?? 'postgres://exam:exam@127.0.0.1:5434';
const REDIS = process.env.LOAD_REDIS_URL ?? 'redis://127.0.0.1:6381/13';
const PORT = 3101;
const api = `http://127.0.0.1:${PORT}/api`;
const ORIGIN = 'http://localhost:4173';
const PASSWORD = 'MatKhau-Thu-123';
const ACCESS_CODE = 'LOAD01';
const MONITORS = 3;
const HEARTBEAT_MS = 15_000;
const JITTER_MS = 300; // NUDGE_JITTER_MAX_MS của trình duyệt
// Ngưỡng đã duyệt (Q236, Q266), mili giây (p99).
const LIMITS = { save: 100, start: 1000, view: 500, heartbeat: 100, burst: 300, nudge: 1000, visible: 1000, extend: 300 };
const MONITOR_P95_LIMIT = 100;
const STORM_LIMIT = 10_000; // 500 kết nối Socket.IO nối lại xong trong 10 giây
const WS_ORIGIN = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (list, p) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : Number.NaN;
};
const samples = {
  login: [],
  join: [],
  sessions: [],
  start: [],
  view: [],
  save: [],
  submit: [],
  heartbeat: [],
  burst: [],
  monitor: [],
  connect: [],
  nudge: [],
  visible: [],
  extend: [],
};
/** Mốc bắt đầu lần Cộng giờ cả phòng (performance.now()); trước đó là 0 nên tin đẩy chưa được đo. */
let extendStartedAt = 0;
const sockets = [];
let finished = false;
const errors = [];
let child;
const resource = [];

function readProc(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
  const rss = Number(fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ')[1]) * 4096;
  return { cpu: (Number(stat[13]) + Number(stat[14])) / 100, rss };
}

class Candidate {
  constructor(i) {
    this.i = i;
    this.cookies = new Map();
  }
  async call(label, method, url, body) {
    const started = performance.now();
    const headers = { origin: ORIGIN };
    if (body) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    try {
      const res = await fetch(`${api}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      for (const line of res.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const [k, ...v] = pair.split('=');
        this.cookies.set(k, v.join('='));
      }
      const elapsed = performance.now() - started;
      const text = await res.text();
      if (res.ok) samples[label].push(elapsed);
      else errors.push(`${label} ${res.status} ${text.slice(0, 120)}`);
      return res.ok ? JSON.parse(text) : null;
    } catch (error) {
      errors.push(`${label} ${error.cause?.code ?? error.message}`);
      return null;
    }
  }
}

async function candidate(i, workUntilOffset) {
  const c = new Candidate(i);
  await sleep(Math.random() * RAMP_MS);
  if (!(await c.call('login', 'POST', '/auth/login', { identifier: `sv${i}`, password: PASSWORD }))) return;
  if (!(await c.call('join', 'POST', '/take/join', { code: ACCESS_CODE }))) return;
  const sessionId = (await c.call('sessions', 'GET', '/take/sessions'))?.items?.[0]?.sessionId;
  if (!sessionId) return;
  const view = await c.call('start', 'POST', `/take/sessions/${sessionId}/start`);
  if (!view) return;
  await c.call('view', 'GET', `/take/attempts/${view.attempt.id}`);
  const items = view.sections.flatMap((s) => s.items);
  const until = Date.now() + workUntilOffset;
  const attemptId = view.attempt.id;
  const stopRealtime = await openAttemptChannel(c, attemptId);
  let since = new Date(Date.now() - 5000).toISOString();
  let sawExtension = false;
  const beat = async (label = 'heartbeat') => {
    const body = await c.call(label, 'POST', `/take/attempts/${attemptId}/heartbeat`, { events: [], since });
    if (!body) return;
    since = body.cursor ?? since;
    if (!sawExtension && extendStartedAt && (body.notices ?? []).some((n) => n.kind === 'time_extended')) {
      sawExtension = true;
      samples.visible.push(performance.now() - extendStartedAt);
    }
  };
  c.beat = beat;
  const heartbeats = setInterval(() => beat(), HEARTBEAT_MS);
  let seq = 0;
  while (Date.now() < until) {
    await sleep(5000 + Math.random() * 10000);
    const item = items[seq % items.length];
    seq += 1;
    await c.call('save', 'PUT', `/take/attempts/${view.attempt.id}/responses`, {
      items: [{ itemId: item.itemId, clientSeq: seq, value: { optionId: item.payload.options[0].id }, flagged: seq % 5 === 0 }],
    });
  }
  clearInterval(heartbeats);
  stopRealtime();
  await c.call('submit', 'POST', `/take/attempts/${attemptId}/submit`);
}

const cookieHeader = (c) => [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

/** Nối Socket.IO của một Người dự thi: vào phòng `attempt:{id}`, nhận nudge thì gửi heartbeat sau độ trễ ngẫu nhiên (như trình duyệt). */
async function openAttemptChannel(c, attemptId) {
  const socket = io(WS_ORIGIN, {
    path: '/ws',
    transports: ['websocket'],
    extraHeaders: { cookie: cookieHeader(c), origin: ORIGIN },
    reconnection: false,
  });
  const entry = { socket, joined: null };
  sockets.push(entry);
  const join = () =>
    new Promise((resolve) => {
      const started = performance.now();
      socket.emit('attempt:join', { attemptId }, (ack) => {
        if (!ack?.ok) errors.push('attempt:join bị từ chối');
        resolve(performance.now() - started);
      });
    });
  entry.rejoin = async () => {
    socket.connect();
    await new Promise((resolve) => socket.once('connect', resolve));
    await join();
  };
  socket.on('attempt.nudge', () => {
    if (extendStartedAt) samples.nudge.push(performance.now() - extendStartedAt);
    setTimeout(() => c.beat?.('burst'), Math.random() * JITTER_MS);
  });
  socket.on('connect_error', (error) => errors.push(`socket ${error.message}`));
  const started = performance.now();
  await new Promise((resolve) => socket.once('connect', resolve));
  await join();
  samples.connect.push(performance.now() - started);
  return () => socket.disconnect();
}

/** Một Người ra đề mở màn Theo dõi: vào phòng `session:{id}`, tải lại khi có tin đẩy và mỗi 10 giây (hỏi lại an toàn). */
async function monitorClient(sessionId, index) {
  const m = new Candidate(-10 - index);
  if (!(await m.call('login', 'POST', '/auth/login', { identifier: 'gv-load', password: PASSWORD }))) return;
  const refresh = () => m.call('monitor', 'GET', `/sessions/${sessionId}/monitor`);
  await refresh();
  const socket = io(WS_ORIGIN, {
    path: '/ws',
    transports: ['websocket'],
    extraHeaders: { cookie: cookieHeader(m), origin: ORIGIN },
    reconnection: false,
  });
  socket.on('monitor.changed', refresh);
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.emit('monitor:join', { sessionId }, () => {});
  const poll = setInterval(refresh, 10_000);
  while (!finished) await sleep(500);
  clearInterval(poll);
  socket.disconnect();
}

/** Ngắt rồi nối lại đồng loạt mọi kết nối Socket.IO; trả thời gian cho đến khi cả đoàn đã vào lại phòng. */
async function reconnectStorm() {
  const live = sockets.filter((entry) => entry.socket.connected);
  for (const entry of live) entry.socket.disconnect();
  const started = performance.now();
  await Promise.all(live.map((entry) => entry.rejoin()));
  return { count: live.length, ms: performance.now() - started };
}

async function main() {
  const { textDoc } = await import('@exam/shared');
  const admin = new Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`create database ${DB}`);
  await admin.end();
  await runMigrations(`${BASE}/${DB}`, path.resolve(__dirname, '../drizzle'));

  const db = new Client({ connectionString: `${BASE}/${DB}` });
  await db.connect();
  const hash = await hashPassword(PASSWORD);
  const makeUser = async (username, code, tag) => {
    const { rows } = await db.query(
      `insert into users (id, username, full_name, password_hash, is_admin, must_change_password, code, class_label)
       values (gen_random_uuid(), $1, $2, $3, false, false, $4, 'K65') returning id`,
      [username, `Người ${username}`, hash, code],
    );
    await db.query(`insert into user_role_tags (user_id, tag) values ($1, $2)`, [rows[0].id, tag]);
    return rows[0].id;
  };
  const examinerName = 'gv-load';
  await makeUser(examinerName, null, 'examiner');
  const ids = [];
  for (let i = 0; i < N; i++) ids.push(await makeUser(`sv${i}`, `SV${String(i).padStart(4, '0')}`, 'candidate'));
  await db.end();
  const redis = new Redis(REDIS);
  await redis.flushdb();
  await redis.quit();

  child = spawn('node', ['dist/main.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      LOG_LEVEL: 'warn',
      DATABASE_URL: `${BASE}/${DB}`,
      REDIS_URL: REDIS,
      APP_ORIGINS: ORIGIN,
      LOGIN_MAX_PER_IP: '1000000',
      DB_POOL_MAX: POOL_MAX,
      SLIP_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
      MEDIA_DIR: '/tmp/exam-load-media',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${api}/health`)).ok) break;
    } catch {}
    await sleep(500);
  }

  // Người ra đề dựng Bộ đề 20 câu chọn một, Phát hành, tạo Phiên thi đang mở và thêm cả lớp.
  const teacher = new Candidate(-1);
  const ok = async (label, ...args) => {
    const result = await teacher.call(label, ...args);
    if (!result) throw new Error(`Dựng dữ liệu thất bại: ${errors.at(-1)}`);
    return result;
  };
  await ok('login', 'POST', '/auth/login', { identifier: examinerName, password: PASSWORD });
  const topic = await ok('submit', 'POST', '/topics', { name: 'Tải' });
  const questionIds = [];
  for (let i = 0; i < 20; i++) {
    const q = await ok('submit', 'POST', '/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: textDoc(`Câu hỏi số ${i + 1}`),
      defaultPoints: 1,
      tags: [],
      payload: {
        options: ['a', 'b', 'c', 'd'].map((id) => ({ id, content: textDoc(`Phương án ${id}`) })),
        key: ['a'],
        shuffleOptions: true,
      },
    });
    questionIds.push(q.id);
  }
  const exam = await ok('submit', 'POST', '/exams', { title: 'Đề đo tải' });
  const saved = await ok('submit', 'PUT', `/exams/${exam.id}`, {
    title: 'Đề đo tải',
    instructions: textDoc(''),
    version: exam.version,
    sections: [{ id: exam.sections[0].id, title: null, instructions: textDoc(''), items: questionIds.map((questionId) => ({ questionId, points: 1 })) }],
  });
  await ok('submit', 'POST', `/exams/${exam.id}/publish`, { version: saved.version });
  const now = Date.now();
  const session = await ok('submit', 'POST', '/sessions', {
    examId: exam.id,
    title: 'Ca đo tải',
    opensAt: new Date(now - 3_600_000).toISOString(),
    closesAt: new Date(now + 4 * 3_600_000).toISOString(),
    durationMinutes: 120,
    accessCode: ACCESS_CODE,
    shuffleItems: true,
    shuffleOptions: true,
  });
  await ok('submit', 'POST', `/sessions/${session.id}/roster`, { userIds: ids });
  for (const key of Object.keys(samples)) samples[key].length = 0;
  errors.length = 0;

  console.log(`Bắt đầu: ${N} người vào rải ${RAMP_MS / 1000} giây, làm bài ${WORK_MS / 1000} giây, DB_POOL_MAX=${POOL_MAX}`);
  let last = readProc(child.pid);
  let lastAt = Date.now();
  const timer = setInterval(() => {
    const cur = readProc(child.pid);
    const at = Date.now();
    resource.push({ cpuPct: ((cur.cpu - last.cpu) / ((at - lastAt) / 1000)) * 100, rss: cur.rss });
    last = cur;
    lastAt = at;
  }, 1000);
  const monitors = Array.from({ length: MONITORS }, (_, i) => monitorClient(session.id, i));
  let storm = null;
  const events = (async () => {
    // Cộng giờ cả phòng khi mọi người đã vào, rồi ngắt/nối lại đồng loạt ở giữa quãng làm bài.
    await sleep(RAMP_MS + WORK_MS * 0.25);
    extendStartedAt = performance.now();
    const extended = await teacher.call('extend', 'POST', `/sessions/${session.id}/extend-time`, {
      scope: 'all',
      minutes: 10,
      reason: 'Đo tải',
      batchId: crypto.randomUUID(),
    });
    console.log(`Cộng giờ cả phòng: ${extended?.extended ?? 0} Lượt`);
    await sleep(WORK_MS * 0.25);
    storm = await reconnectStorm();
  })();
  await Promise.all(Array.from({ length: N }, (_, i) => candidate(i, WORK_MS)));
  finished = true;
  await Promise.all([events, ...monitors]);
  clearInterval(timer);

  const row = (name) => {
    const list = samples[name];
    return `${name.padEnd(7)} ${String(list.length).padStart(6)} lần  p50=${pct(list, 0.5).toFixed(0)}ms  p95=${pct(list, 0.95).toFixed(0)}ms  p99=${pct(list, 0.99).toFixed(0)}ms  max=${Math.max(...list, 0).toFixed(0)}ms`;
  };
  console.log('\n' + Object.keys(samples).map(row).join('\n'));
  const avgCpu = resource.reduce((a, s) => a + s.cpuPct, 0) / Math.max(1, resource.length);
  if (storm) console.log(`Nối lại đồng loạt: ${storm.count} kết nối vào lại phòng trong ${storm.ms.toFixed(0)} ms`);
  console.log(`\napi: CPU trung bình ${avgCpu.toFixed(0)}% / đỉnh ${Math.max(...resource.map((s) => s.cpuPct)).toFixed(0)}% của 1 lõi, RAM đỉnh ${(Math.max(...resource.map((s) => s.rss)) / 1048576).toFixed(0)} MB`);
  console.log(`Lỗi: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 8).join('\n  ') : ''}`);

  const failures = [];
  if (errors.length) failures.push(`có ${errors.length} lỗi`);
  const monitorP95 = pct(samples.monitor, 0.95);
  if (!(monitorP95 < MONITOR_P95_LIMIT)) failures.push(`monitor p95 ${monitorP95.toFixed(0)}ms ≥ ${MONITOR_P95_LIMIT}ms`);
  if (!storm) failures.push('không đo được đợt nối lại');
  else if (!(storm.ms < STORM_LIMIT)) failures.push(`nối lại ${storm.count} kết nối mất ${storm.ms.toFixed(0)}ms ≥ ${STORM_LIMIT}ms`);
  for (const [name, limit] of Object.entries(LIMITS)) {
    const p99 = pct(samples[name], 0.99);
    if (!(p99 < limit)) failures.push(`${name} p99 ${p99.toFixed(0)}ms ≥ ${limit}ms`);
  }
  console.log(failures.length ? `\nKHÔNG ĐẠT: ${failures.join('; ')}` : '\nĐẠT: 0 lỗi, mọi p99 dưới ngưỡng');
  return failures.length ? 1 : 0;
}

main()
  .then(async (code) => {
    child?.kill('SIGTERM');
    await sleep(1500);
    const admin = new Client({ connectionString: `${BASE}/postgres` });
    await admin.connect();
    await admin.query(`drop database if exists ${DB} with (force)`);
    await admin.end();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    child?.kill('SIGTERM');
    process.exit(2);
  });
