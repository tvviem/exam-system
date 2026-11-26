import { LIST_TOTAL_CAP } from '@exam/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { openLiveSession } from './support/live-session';
import { resetState } from './support/reset';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Đo quy mô lớn (docs/plan/quy-mo-lon-thiet-ke.md mục 8, Q485). Chỉ chạy khi đặt QUY_MO_BENCH=1, không chạy trong CI:
//   QUY_MO_BENCH=1 pnpm --filter @exam/api exec vitest run --project integration test/quy-mo-bench.int.test.ts
// Mặc định 100.000 Câu hỏi của một người và 100.000 tài khoản (khoảng 30 giây). Ngưỡng của thiết kế đặt cho 1.000.000:
// thêm QUY_MO_N=1000000 (khoảng 4 phút, cơ sở dữ liệu test lên vài GB, xóa sạch khi xong). Đừng chạy lúc máy đang phục vụ thi.
// Chạy ở ưu tiên thường: hạ ưu tiên (nice) làm số đo các đợt dồn dập xấu đi nhiều lần.
//
// Các trường hợp HIẾM được gieo ở đầu CŨ NHẤT một cách cố ý: truy vấn đi dọc chỉ mục "mới trước" phải đi gần hết bảng mới gặp
// chúng, đúng kiểu lỗi từng lọt qua lần đo đầu (mục 6.5).

const N = Number(process.env.QUY_MO_N) || 100_000;
const BATCH = 100_000;
const RARE = 20;
const WORDS =
  'cây ngăn xếp hàng đợi đồ thị bảng băm tập hợp danh sách phần tử con trỏ mảng duyệt chèn xóa tìm kiếm sắp độ phức tạp'.split(
    ' ',
  );
const plain = (word: string) =>
  word
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
  if (process.env.QUY_MO_BENCH) await resetState();
});

/** Câu hỏi số n sửa cách đây n giây: n càng lớn càng cũ. `RARE` câu cũ nhất mang Chủ đề, tag và Loại hiếm. */
async function seedQuestions(ownerId: string) {
  await sql(
    `INSERT INTO topics (id, owner_id, name, name_key)
     SELECT gen_random_uuid(), $1::uuid, 'QM ' || lpad(i::text, 3, '0'), 'qm ' || lpad(i::text, 3, '0') FROM generate_series(1, 50) i
     UNION ALL SELECT gen_random_uuid(), $1::uuid, 'QM hiếm', 'qm hiem'`,
    [ownerId],
  );
  for (let from = 1; from <= N; from += BATCH) {
    await sql(
      `WITH t AS (SELECT array_agg(id ORDER BY name_key) AS ids FROM topics WHERE owner_id = $1)
       INSERT INTO questions (id, topic_id, owner_id, type, stem, payload, default_points, tags, search_text, updated_at, archived_at)
       SELECT gen_random_uuid(), CASE WHEN n > $4 - ${RARE} THEN t.ids[51] ELSE t.ids[1 + n % 50] END, $1,
         (CASE WHEN n > $4 - ${RARE} THEN 'essay' WHEN n % 2 = 0 THEN 'single_choice' ELSE 'multiple_choice' END)::question_type,
         jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
           jsonb_build_array(jsonb_build_object('type','text','text', 'Câu ' || n || ' ' || w.acc))))),
         '{"maxLength": 100}', 1,
         CASE WHEN n > $4 - ${RARE} THEN ARRAY['rathiem'] ELSE ARRAY['nhom ' || (n % 200)] END,
         'cau ' || n || ' ' || w.plain,
         now() - (n || ' seconds')::interval,
         CASE WHEN n % 50 = 7 AND n <= $4 - ${RARE} THEN now() END
       FROM t, generate_series($2::int, $3::int) n
       CROSS JOIN LATERAL (
         SELECT string_agg(($5::text[])[1 + h], ' ') AS acc, string_agg(($6::text[])[1 + h], ' ') AS plain
         FROM (SELECT (abs(hashint8(n::bigint * 131 + k)) % $7)::int AS h FROM generate_series(1, 12) k) x
       ) w`,
      [ownerId, from, Math.min(from + BATCH - 1, N), N, WORDS, WORDS.map(plain), WORDS.length],
    );
  }
}

/** Người số i tạo cách đây i giây. Nhóm cũ nhất: 50 bị Khóa, trước đó 100 email chưa xác thực, trước nữa 50 đã Xóa. */
async function seedAccounts() {
  for (let from = 1; from <= N; from += BATCH) {
    await sql(
      `WITH added AS (
         INSERT INTO users (id, username, email, full_name, code, class_label, password_hash, activated_at, email_verified_at,
                            status, locked_at, removed_at, created_at)
         SELECT gen_random_uuid(), 'qm' || i, 'qm' || i || '@qm.example.edu.vn',
           (ARRAY['Nguyễn','Trần','Lê','Phạm','Huỳnh','Võ','Đặng','Bùi'])[1 + i % 8] || ' Văn ' ||
           (ARRAY['An','Bình','Chi','Dũng','Giang','Hà','Khang','Linh','Minh','Nam','Phúc'])[1 + i % 11] || ' ' || i,
           'QM' || lpad(i::text, 8, '0'), 'QM-LOP-' || lpad((i / 50)::text, 6, '0'),
           CASE WHEN i % 10 < 8 THEN 'x' END, CASE WHEN i % 10 < 8 THEN now() END,
           CASE WHEN i % 10 < 8 AND NOT (i > $3 - 150 AND i <= $3 - 50) THEN now() END,
           (CASE WHEN i > $3 - 50 THEN 'locked' ELSE 'active' END)::user_status, CASE WHEN i > $3 - 50 THEN now() END,
           CASE WHEN i > $3 - 200 AND i <= $3 - 150 THEN now() END,
           now() - (i || ' seconds')::interval
         FROM generate_series($1::int, $2::int) i RETURNING id)
       INSERT INTO user_role_tags (user_id, tag) SELECT id, 'candidate' FROM added`,
      [from, Math.min(from + BATCH - 1, N), N],
    );
  }
  await sql(
    `INSERT INTO login_events (id, user_id, identifier_tried, success, at)
     SELECT gen_random_uuid(), id, username, false, created_at FROM users`,
  );
  await sql(
    `INSERT INTO audit_logs (action, entity_type, entity_id, at) SELECT 'user.created', 'user', id, created_at FROM users`,
  );
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;
const rows: string[] = [];
/** Ghi một dòng kết quả và kiểm ngưỡng (soft: một ngưỡng trượt không che các số đo còn lại). */
function report(label: string, ms: number, limit: number) {
  rows.push(
    `${ms < limit ? 'đạt ' : 'TRƯỢT'}  ${label.padEnd(52)} ${ms.toFixed(0).padStart(6)} ms   (ngưỡng ${limit} ms)`,
  );
  expect.soft(ms, label).toBeLessThan(limit);
}

describe.skipIf(!process.env.QUY_MO_BENCH)(`đo quy mô lớn: ${N} Câu hỏi, ${N} tài khoản`, () => {
  it('đạt các ngưỡng của thiết kế, kể cả trường hợp hiếm và đường làm bài giữa đợt tìm dồn dập', async () => {
    await resetState();
    const live = await openLiveSession(t, ['an']);
    const bigId = (await seedUser({ username: 'gv-lon', roleTags: ['examiner'] })).id;
    await seedUser({ username: 'quantri', isAdmin: true });
    const big = (await login(t.app, 'gv-lon', DEFAULT_PASSWORD)).cookie as string;
    const admin = (await login(t.app, 'quantri', DEFAULT_PASSWORD)).cookie as string;
    await seedQuestions(bigId);
    await seedAccounts();
    await sql('ANALYZE');

    const send = (cookie: string, url: string, body?: unknown) =>
      call(t.app, body === undefined ? 'GET' : 'POST', url, { cookie, body });
    const time = async (cookie: string, url: string, body?: unknown) => {
      const times: number[] = [];
      for (let i = 0; i < 6; i++) {
        const start = performance.now();
        const res = await send(cookie, url, body);
        expect(res.statusCode, `${url} ${res.body.slice(0, 200)}`).toBeLessThan(300);
        if (i > 0) times.push(performance.now() - start); // lần đầu làm nóng
      }
      return median(times);
    };
    const measure = async (cases: [string, string, number][], cookie: string) => {
      for (const [label, url, limit] of cases) report(label, await time(cookie, url), limit);
    };

    // ---------- Ngân hàng câu hỏi ----------
    const topicOf = async (name: string) =>
      (
        await sql<{ id: string }>('SELECT id FROM topics WHERE owner_id = $1 AND name = $2', [
          bigId,
          name,
        ])
      )[0]?.id;
    const topic = await topicOf('QM 001');
    const rareTopic = await topicOf('QM hiếm');
    const lastPage = LIST_TOTAL_CAP / 20;
    await measure(
      [
        ['Câu hỏi: trang 1', '/api/questions', 100],
        ['Câu hỏi: trang cuối cho phép', `/api/questions?page=${lastPage}`, 100],
        ['Câu hỏi: một Chủ đề', `/api/questions?topicId=${topic}`, 100],
        ['Câu hỏi: Loại phổ biến', '/api/questions?type=single_choice', 100],
        ['Câu hỏi: tag', '/api/questions?tag=nhom%2017', 100],
        ['Câu hỏi: Lưu trữ', '/api/questions?archived=true', 100],
        ['Hiếm: Chủ đề chỉ có câu cũ nhất', `/api/questions?topicId=${rareTopic}`, 100],
        ['Hiếm: tag chỉ ở câu cũ nhất', '/api/questions?tag=rathiem', 100],
        // Quét theo Loại không có chỉ mục riêng: ngưỡng nới (docs mục 6.5).
        ['Hiếm: Loại chỉ ở câu cũ nhất', '/api/questions?type=essay', 500],
        ['Chủ đề kèm số câu', '/api/topics', 200],
        ['Tìm Câu hỏi: từ phổ biến', '/api/questions?q=ngan%20xep', 500],
        ['Tìm Câu hỏi: chỉ khớp câu cũ nhất', `/api/questions?q=cau%20${N - 3}`, 500],
        ['Tìm Câu hỏi: không có', '/api/questions?q=khongcocaunao', 500],
      ],
      big,
    );

    // ---------- Quản trị viên ----------
    const late = N - 300; // một người gần cuối, không thuộc nhóm hiếm
    await measure(
      [
        ['Người dùng: trang 1', '/api/admin/users', 200],
        ['Người dùng: trang cuối cho phép', `/api/admin/users?page=${lastPage}`, 200],
        ['Người dùng: Nhãn Người dự thi', '/api/admin/users?roleTag=candidate', 200],
        ['Người dùng: Chờ kích hoạt', '/api/admin/users?activation=pending', 200],
        ['Hiếm: bị Khóa (cũ nhất)', '/api/admin/users?status=locked', 200],
        ['Hiếm: đã Xóa', '/api/admin/users?status=removed', 200],
        ['Hiếm: email chưa xác thực', '/api/admin/users?activation=unverified', 200],
        ['Tìm Người dùng: mã', `/api/admin/users?q=QM${String(late).padStart(8, '0')}`, 500],
        [
          'Tìm Người dùng: họ tên',
          `/api/admin/users?q=van%20khang%20${late - (late % 11) + 6}`,
          500,
        ],
        ['Tìm Người dùng: tên phổ biến', '/api/admin/users?q=khang', 500],
        ['Tìm Người dùng: không có', '/api/admin/users?q=khongaicaten', 500],
        // 1–2 ký tự đi đường quét cột (mục 6.6).
        ['Tìm Người dùng: 2 ký tự', '/api/admin/users?q=an', 1000],
        ['Lịch sử đăng nhập', '/api/admin/login-events', 200],
        ['Nhật ký thao tác', '/api/admin/audit-logs', 200],
      ],
      admin,
    );

    // ---------- Lập Danh sách dự thi ----------
    const roster = `/api/sessions/${live.sessionId}/roster`;
    await measure(
      [
        ['Gợi ý người: mã', `${roster}/search?q=QM${String(late).padStart(8, '0')}`, 500],
        ['Gợi ý người: tên phổ biến', `${roster}/search?q=khang`, 500],
        ['Gợi ý người: Lớp', `${roster}/search?q=qm-lop-000010`, 500],
      ],
      live.examiner,
    );
    // Danh sách tối đa 500 người, Phiên thi dựng sẵn đã có 4.
    const codes = Array.from({ length: 490 }, (_, i) => `QM${String(1 + i * 3).padStart(8, '0')}`);
    report(
      'Dán 490 mã (xem trước)',
      await time(live.examiner, roster, { codes, dryRun: true }),
      200,
    );
    report(
      'Thêm cả lớp (xem trước)',
      await time(live.examiner, roster, { classLabel: 'QM-LOP-000010', dryRun: true }),
      200,
    );

    // ---------- Tìm dồn dập: người khác và đường làm bài ----------
    const an = live.takers.an;
    if (!an) throw new Error('thiếu người đang làm bài');
    const view = (await an.call('GET', `/take/attempts/${live.attemptIds.an}`)).json();
    const item = view.sections[0].items.find((i: { type: string }) => i.type === 'single_choice');
    let seq = 0;
    const save = async () => {
      t.clock.advance(1000); // đồng hồ giả: giãn các lần lưu để không chạm giới hạn tần suất
      seq++;
      const start = performance.now();
      const res = await an.call('PUT', `/take/attempts/${live.attemptIds.an}/responses`, {
        items: [
          { itemId: item.itemId, value: { optionId: seq % 2 ? 'o1' : 'o2' }, clientSeq: seq },
        ],
      });
      expect(res.statusCode, res.body).toBe(200);
      return performance.now() - start;
    };
    /** Lưu câu trả lời liên tục (và người ra đề khác mở trang) trong lúc `requests` đang chạy. */
    const during = async (label: string, requests: () => Promise<unknown>[]) => {
      let done = false;
      const noise = Promise.all(requests()).finally(() => {
        done = true;
      });
      const saves: number[] = [];
      await new Promise((resolve) => setTimeout(resolve, 50));
      const start = performance.now();
      const other = await send(live.examiner, '/api/questions');
      const otherMs = performance.now() - start;
      expect(other.statusCode, other.body).toBe(200);
      do {
        saves.push(await save());
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (!done);
      await noise;
      report(`${label}: lưu câu trả lời chậm nhất`, Math.max(...saves), 100);
      report(`${label}: người ra đề khác mở trang`, otherMs, 300);
    };
    await during('40 lượt tìm Câu hỏi', () =>
      Array.from({ length: 40 }, () => send(big, '/api/questions?q=ngan%20xep')),
    );
    await during('40 lượt tìm Người dùng 2 ký tự', () =>
      Array.from({ length: 40 }, () => send(admin, '/api/admin/users?q=an')),
    );

    let burst = 0;
    const start = performance.now();
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        const res = await send(big, '/api/questions');
        if (res.statusCode === 200) burst++;
      }),
    );
    report('20 yêu cầu trang 1 cùng lúc (đến lượt cuối)', performance.now() - start, 500);
    expect(burst).toBe(20);

    // Ghi thẳng ra stderr: bộ test chặn console.log của ứng dụng.
    process.stderr.write(`\nQuy mô: ${N} Câu hỏi, ${N} tài khoản\n${rows.join('\n')}\n\n`);
  }, 1_800_000);
});
