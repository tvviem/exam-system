#!/usr/bin/env node
// Phòng thi thử cho chủ dự án (Q269, docs/plan/slice-4.md): dựng một Phiên thi đang mở trong cơ sở dữ liệu dev và cho N
// "người dự thi giả" vào thi, làm bài, gửi heartbeat, thỉnh thoảng rời tab, mất mạng hoặc làm chậm. Chủ dự án đăng nhập
// Người ra đề `demo-gv` để xem màn Theo dõi ở 30, 120, 300 người và thử Cộng giờ, Buộc nộp, Thu hồi mà không cần mở nhiều trình duyệt.
//
//   pnpm -C apps/api build                       (script dùng mã đã build)
//   pnpm dev                                      (api cổng 3000 và web cổng 5173 đang chạy; cần LOGIN_MAX_PER_IP=100000 trong apps/api/.env)
//   pnpm -C apps/api demo:room                    (120 người, Thời lượng 30 phút)
//   pnpm -C apps/api demo:room --users 300 --minutes 45
//   pnpm -C apps/api demo:room --clean            (xóa mọi dữ liệu `demo-*` do script tạo)
//
// Người dự thi giả đi qua chính API thật (đăng nhập, vào thi, bắt đầu, lưu bài, heartbeat) nên màn Theo dõi hiện đúng như thật.
// Thôi mô phỏng bằng Ctrl-C; dữ liệu còn nguyên cho tới khi chạy `--clean`.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { hashPassword } = require('../dist/modules/identity/password/password-hasher.js');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const CLEAN = args.includes('--clean');
const N = Number(flag('users', 120));
const MINUTES = Number(flag('minutes', 30));
const API = flag('api', 'http://localhost:3000/api');
const ORIGIN = flag('origin', 'http://localhost:5173');
const RAMP_MS = 20_000;
const HEARTBEAT_MS = 15_000;
const PASSWORD = 'Demo-Phong-Thi-123';
const TEACHER = 'demo-gv';
const ACCESS_CODE = 'DEMO01';
const CLASSES = ['DEMO-A', 'DEMO-B', 'DEMO-C', 'DEMO-D'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (i) => String(i + 1).padStart(3, '0');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envFile)) {
    const line = fs.readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
    if (line) return line.slice('DATABASE_URL='.length).trim();
  }
  return 'postgres://exam:exam@127.0.0.1:5434/exam';
}

const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Đặng', 'Bùi'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Quốc', 'Thu', 'Hoàng', 'Ngọc', 'Gia'];
const FIRST = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Hạnh', 'Khoa', 'Lan', 'Minh', 'Nam', 'Oanh', 'Phúc', 'Quân', 'Sơn', 'Trang', 'Uyên', 'Vinh', 'Yến'];
const nameOf = (i) => `${LAST[i % LAST.length]} ${MIDDLE[Math.floor(i / 3) % MIDDLE.length]} ${FIRST[Math.floor(i / 7) % FIRST.length]} ${pad(i)}`;

// ---------------------------------------------------------------------------------------------------------------------
// Dọn dữ liệu: đi theo khóa ngoại từ các tài khoản `demo-*` tới mọi dòng phụ thuộc (Lượt, Câu trả lời, nhật ký chỉ ghi thêm...).
// Nhật ký chỉ ghi thêm có trigger chặn xóa, nên xóa trong một giao dịch với `session_replication_role = replica` (cần quyền siêu người dùng,
// dev có sẵn).
async function clean() {
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    const { rows: roles } = await db.query(`select rolsuper from pg_roles where rolname = current_user`);
    if (!roles[0]?.rolsuper) throw new Error('Cần tài khoản cơ sở dữ liệu có quyền siêu người dùng (pod dev-exam có sẵn).');
    const { rows: fks } = await db.query(`
      select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
        (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as child_cols,
        (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as parent_cols
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`);
    const roots = (await db.query(`select ctid::text as ctid from users where username like 'demo-%'`)).rows.map((r) => r.ctid);
    if (roots.length === 0) {
      console.log('Không có dữ liệu demo để dọn.');
      return;
    }
    const found = new Map();
    const add = (table, ctids) => {
      const set = found.get(table) ?? new Set();
      const fresh = ctids.filter((c) => !set.has(c));
      for (const c of fresh) set.add(c);
      found.set(table, set);
      return fresh;
    };
    const queue = [['users', add('users', roots)]];
    while (queue.length) {
      const [table, ctids] = queue.shift();
      for (const fk of fks.filter((f) => f.parent === table)) {
        const on = fk.child_cols.map((col, i) => `c."${col}" = p."${fk.parent_cols[i]}"`).join(' and ');
        const { rows } = await db.query(
          `select c.ctid::text as ctid from ${fk.child} c join ${fk.parent} p on ${on} where p.ctid = any($1::tid[])`,
          [ctids],
        );
        const fresh = add(fk.child, rows.map((r) => r.ctid));
        if (fresh.length) queue.push([fk.child, fresh]);
      }
    }
    // An toàn: chỉ được xóa khi mọi người dùng bị cuốn theo đều là tài khoản demo.
    const strangers = await db.query(
      `select username from users where ctid = any($1::tid[]) and username not like 'demo-%'`,
      [[...found.get('users')]],
    );
    if (strangers.rowCount) {
      throw new Error(`Dữ liệu demo liên quan tới tài khoản không phải demo (${strangers.rows.map((r) => r.username).join(', ')}); không xóa.`);
    }
    await db.query('begin');
    await db.query(`set local session_replication_role = replica`);
    let total = 0;
    for (const [table, set] of found) {
      const res = await db.query(`delete from ${table} where ctid = any($1::tid[])`, [[...set]]);
      total += res.rowCount ?? 0;
    }
    await db.query('commit');
    console.log(`Đã xóa ${total} dòng của dữ liệu demo (${found.get('users').size} tài khoản).`);
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
class Client_ {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }
  async call(method, url, body) {
    const headers = { origin: ORIGIN };
    if (body) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${API}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';');
      const [k, ...v] = pair.split('=');
      this.cookies.set(k, v.join('='));
    }
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
  }
  async must(method, url, body) {
    const res = await this.call(method, url, body);
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
    return res.body;
  }
}

async function seed() {
  const db = new Client({ connectionString: databaseUrl() });
  await db.connect();
  try {
    const existing = await db.query(`select 1 from users where username like 'demo-%' limit 1`);
    if (existing.rowCount) throw new Error('Đã có dữ liệu demo. Chạy `pnpm -C apps/api demo:room --clean` trước.');
    const hash = await hashPassword(PASSWORD);
    const make = async (username, fullName, code, classLabel, tag) => {
      const { rows } = await db.query(
        `insert into users (id, username, full_name, password_hash, is_admin, must_change_password, code, class_label)
         values (gen_random_uuid(), $1, $2, $3, false, false, $4, $5) returning id`,
        [username, fullName, hash, code, classLabel],
      );
      await db.query(`insert into user_role_tags (user_id, tag) values ($1, $2)`, [rows[0].id, tag]);
      return rows[0].id;
    };
    await make(TEACHER, 'Người ra đề Demo', null, null, 'examiner');
    const ids = [];
    for (let i = 0; i < N; i++) {
      ids.push(await make(`demo-sv${pad(i)}`, nameOf(i), `DEMO-${pad(i)}`, CLASSES[i % CLASSES.length], 'candidate'));
    }
    return ids;
  } finally {
    await db.end();
  }
}

async function buildSession(teacher, userIds) {
  const { textDoc } = await import('@exam/shared');
  const topic = await teacher.must('POST', '/topics', { name: 'Demo phòng thi' });
  const questionIds = [];
  for (let i = 0; i < 20; i++) {
    const q = await teacher.must('POST', '/questions', {
      type: 'single_choice',
      topicId: topic.id,
      stem: textDoc(`Câu hỏi thử số ${i + 1}`),
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
  const exam = await teacher.must('POST', '/exams', { title: 'Đề thử phòng thi' });
  const saved = await teacher.must('PUT', `/exams/${exam.id}`, {
    title: 'Đề thử phòng thi',
    instructions: textDoc(''),
    version: exam.version,
    sections: [{ id: exam.sections[0].id, title: null, instructions: textDoc(''), items: questionIds.map((questionId) => ({ questionId, points: 1 })) }],
  });
  await teacher.must('POST', `/exams/${exam.id}/publish`, { version: saved.version });
  const now = Date.now();
  const session = await teacher.must('POST', '/sessions', {
    examId: exam.id,
    title: `Phòng thi thử (${N} người)`,
    opensAt: new Date(now - 10 * 60_000).toISOString(),
    closesAt: new Date(now + 6 * 3_600_000).toISOString(),
    durationMinutes: MINUTES,
    accessCode: ACCESS_CODE,
  });
  await teacher.must('POST', `/sessions/${session.id}/roster`, { userIds });
  return session.id;
}

// Hành vi của người dự thi giả theo số thứ tự: đa số làm bình thường, một số cố ý có dấu hiệu "Cần chú ý".
function behaviorOf(i) {
  if (i % 20 === 1) return 'tab'; // rời tab nhiều lần
  if (i % 20 === 2) return 'offline'; // mất mạng vài phút
  if (i % 20 === 3 || i % 20 === 4) return 'slow'; // làm rất chậm
  return 'normal';
}

const stats = { working: 0, submitted: 0, stopped: 0, offline: 0, failed: 0 };
let stopping = false;

async function candidate(i, startedAtRef) {
  const behavior = behaviorOf(i);
  const c = new Client_(`sv${pad(i)}`);
  await sleep(Math.random() * RAMP_MS);
  if (stopping) return;
  const login = await c.call('POST', '/auth/login', { identifier: `demo-sv${pad(i)}`, password: PASSWORD });
  if (!login.ok) {
    stats.failed += 1;
    if (login.status === 429 && !candidate.warned) {
      candidate.warned = true;
      console.error('\nĐăng nhập bị giới hạn (429). Thêm LOGIN_MAX_PER_IP=100000 vào apps/api/.env, khởi động lại api rồi chạy lại.');
    }
    return;
  }
  await c.must('POST', '/take/join', { code: ACCESS_CODE });
  const sessions = await c.must('GET', '/take/sessions');
  const view = await c.must('POST', `/take/sessions/${sessions.items[0].sessionId}/start`);
  const attemptId = view.attempt.id;
  const items = view.sections.flatMap((s) => s.items);
  stats.working += 1;
  const startedAt = Date.now();
  startedAtRef.count += 1;

  let since = new Date(startedAt - 5000).toISOString();
  let seq = 0;
  let pending = [];
  const event = (type) => pending.push({ id: crypto.randomUUID(), type });
  const finishAt = startedAt + MINUTES * 60_000 * (0.7 + Math.random() * 0.25);
  // Mỗi hành vi có "lịch" riêng tính từ lúc bắt đầu.
  const offlineFrom = startedAt + 60_000;
  const offlineTo = offlineFrom + 3 * 60_000;
  let hiddenDone = 0;
  let wasOffline = false;
  let nextHeartbeat = startedAt + Math.random() * HEARTBEAT_MS;
  let nextSave = startedAt + 5_000 + Math.random() * 15_000;

  const save = async () => {
    seq += 1;
    const item = items[seq % items.length];
    await c.call('PUT', `/take/attempts/${attemptId}/responses`, {
      items: [{ itemId: item.itemId, clientSeq: seq, value: { optionId: item.payload.options[0].id }, flagged: false }],
    });
  };

  while (!stopping) {
    const now = Date.now();
    if (behavior === 'offline') {
      const offline = now >= offlineFrom && now < offlineTo;
      if (offline && !wasOffline) stats.offline += 1;
      if (!offline && wasOffline) {
        stats.offline -= 1;
        event('back_online');
      }
      wasOffline = offline;
    }
    if (behavior === 'tab' && hiddenDone < 5 && now >= startedAt + 20_000 * (hiddenDone + 1)) {
      hiddenDone += 1;
      event('tab_hidden');
      event('tab_visible');
    }
    if (!wasOffline && now >= nextHeartbeat) {
      nextHeartbeat = now + HEARTBEAT_MS;
      const events = pending.splice(0, 20);
      const beat = await c.call('POST', `/take/attempts/${attemptId}/heartbeat`, { events, since });
      if (!beat.ok) pending = [...events, ...pending];
      else {
        since = beat.body.cursor ?? since;
        if (beat.body.status === 'submitted' || beat.body.deviceOk === false) break;
      }
    }
    if (!wasOffline && now >= nextSave) {
      nextSave = now + (behavior === 'slow' ? 120_000 : 8_000 + Math.random() * 20_000);
      await save();
    }
    if (behavior === 'normal' && now >= finishAt) {
      await c.call('POST', `/take/attempts/${attemptId}/submit`);
      stats.submitted += 1;
      stats.working -= 1;
      return;
    }
    await sleep(1000);
  }
  stats.working -= 1;
  stats.stopped += 1;
}
candidate.warned = false;

async function simulate() {
  const userIds = await seed();
  const teacher = new Client_('gv');
  await teacher.must('POST', '/auth/login', { identifier: TEACHER, password: PASSWORD });
  const sessionId = await buildSession(teacher, userIds);
  console.log(`
Đã dựng phòng thi thử: ${N} người, Thời lượng ${MINUTES} phút, Mã vào thi ${ACCESS_CODE}.
  Đăng nhập Người ra đề:  ${ORIGIN}   tên đăng nhập ${TEACHER}   mật khẩu ${PASSWORD}
  Màn Theo dõi:           ${ORIGIN}/examiner/sessions/${sessionId}?tab=monitor
Người dự thi giả vào thi rải trong ${RAMP_MS / 1000} giây. Cứ 20 người: 1 hay rời tab, 1 mất mạng 3 phút, 2 làm rất chậm; phần còn lại nộp bài
sau khoảng 70-95% Thời lượng. Buộc nộp, Cộng giờ, Thu hồi bạn thử ở màn Theo dõi sẽ tới họ qua heartbeat 15 giây.
Ctrl-C để dừng mô phỏng (dữ liệu còn nguyên); \`pnpm -C apps/api demo:room --clean\` để xóa.\n`);

  const startedAtRef = { count: 0 };
  const report = setInterval(() => {
    console.log(`  đang làm ${stats.working} · đã nộp ${stats.submitted} · bị dừng (Buộc nộp/Thu hồi) ${stats.stopped} · đang mất mạng ${stats.offline} · lỗi ${stats.failed}`);
  }, 10_000);
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\nĐang dừng mô phỏng… Dữ liệu demo còn nguyên (xóa bằng --clean).');
  });
  await Promise.all(Array.from({ length: N }, (_, i) => candidate(i, startedAtRef)));
  clearInterval(report);
  console.log('Mô phỏng đã dừng.');
}

(CLEAN ? clean() : simulate()).then(
  () => process.exit(0),
  (error) => {
    console.error(error.message ?? error);
    process.exit(1);
  },
);
