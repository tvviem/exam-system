import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptSweepJob } from '../src/modules/attempt/attempt-sweep.job';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { minutes } from './support/fake-clock';
import { call, login } from './support/http';
import { leaks } from './support/leaks';
import { resetState } from './support/reset';
import { fullExam, Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

let t: TestApp;
let examiner: string;
let examId: string;
let sessionId: string;
let an: Taker;
let binh: Taker;
let anId: string;
let binhId: string;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const examinerApi = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) =>
  call(t.app, method, `/api${path}`, { cookie: examiner, body });

// Giờ giả mặc định là 2/11/2026 08:00 (GMT+7). Phiên thi mở 07:00, đóng 10:00, Thời lượng 45 phút, tối đa 2 Lượt.
const settings = (over: Record<string, unknown> = {}) => ({
  examId,
  title: 'Giữa kỳ - ca 1',
  opensAt: '2026-11-02T07:00:00+07:00',
  closesAt: '2026-11-02T10:00:00+07:00',
  durationMinutes: 45,
  maxAttempts: 2,
  accessCode: 'AB3K9X',
  ...over,
});

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  binhId = (await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] })).id;
  await seedUser({ username: 'chi', code: 'SV003', roleTags: ['candidate'] });
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  examId = (await fullExam(t, examiner)).id;
  const created = await examinerApi('POST', '/sessions', settings());
  expect(created.statusCode, created.body).toBe(201);
  sessionId = created.json().id;
  const added = await examinerApi('POST', `/sessions/${sessionId}/roster`, {
    userIds: [anId, binhId],
  });
  expect(added.statusCode, added.body).toBe(200);
  an = await Taker.signIn(t, 'an');
  binh = await Taker.signIn(t, 'binh');
});

const reasonOf = (res: { json: () => { reason?: string } }) => res.json().reason;

describe('vào thi: nhập Mã vào thi và Gắn thiết bị (Q229)', () => {
  it('nhập đúng mã thì gắn thiết bị và đặt cookie mã thiết bị HttpOnly; nhập lại cùng thiết bị vẫn được', async () => {
    const res = await an.join('AB3K9X');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ sessionId, attemptId: null });
    const cookie = res.cookies.find((c) => c.name === 'exam_did');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{22}$/); // 128 bit base64url
    const rows = await sql<{ device_hash: string }>(`select device_hash from session_devices`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.device_hash).not.toContain(cookie?.value); // chỉ lưu bản băm
    expect((await an.join(' ab3-k9x ')).statusCode).toBe(200); // không phân biệt hoa thường, bỏ khoảng trắng và gạch
    expect(await sql(`select 1 from session_devices`)).toHaveLength(1);
  });

  it('mã sai và người không có trong Danh sách nhận cùng một lỗi chung', async () => {
    const wrong = await an.join('ZZ9K3X');
    const outsider = await (await Taker.signIn(t, 'chi')).join('AB3K9X');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual(outsider.json());
    expect(wrong.json().code).toBe('INVALID_ACCESS_CODE');
  });

  it('sai quá 5 lần trong 10 phút thì bị chặn tạm, nhập đúng thì xóa đếm', async () => {
    for (let i = 0; i < 5; i++) await an.join('ZZ9K3X');
    const blocked = await an.join('AB3K9X');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('RATE_LIMITED');
    t.clock.advance(minutes(11));
    expect((await an.join('AB3K9X')).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await an.join('ZZ9K3X');
    expect((await an.join('AB3K9X')).statusCode).toBe(200); // thành công xóa đếm
    for (let i = 0; i < 4; i++) await an.join('ZZ9K3X');
    expect((await an.join('AB3K9X')).statusCode).toBe(200);
  });

  it('thiết bị khác của cùng người, hoặc thiết bị đã phục vụ người khác, bị từ chối; vẫn đăng nhập được', async () => {
    await an.join('AB3K9X');
    const phone = await Taker.signIn(t, 'an'); // đăng nhập lại trên máy khác, không có cookie thiết bị
    const other = await phone.join('AB3K9X');
    expect(other.statusCode).toBe(409);
    expect(reasonOf(other)).toBe('DEVICE_BOUND_ELSEWHERE');

    const shared = new Taker(t, binh.cookie);
    shared.device = an.device; // Bình dùng chính máy của An
    const res = await shared.join('AB3K9X');
    expect(reasonOf(res)).toBe('DEVICE_BOUND_ELSEWHERE');
  });

  it('hai thiết bị của cùng người nhập mã cùng lúc: chỉ một thiết bị thắng (S4)', async () => {
    const a = new Taker(t, an.cookie);
    const b = new Taker(t, an.cookie);
    const [x, y] = await Promise.all([a.join('AB3K9X'), b.join('AB3K9X')]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 409]);
    expect(await sql(`select 1 from session_devices where status = 'active'`)).toHaveLength(1);
  });

  it('báo đúng lý do khi chưa mở, đã đóng cửa vào thi, đã đóng và đã hủy', async () => {
    t.clock.advance(-minutes(90)); // 06:30, chưa mở
    expect(reasonOf(await an.join('AB3K9X'))).toBe('NOT_OPEN_YET');
    t.clock.advance(minutes(90));
    await sql(`update sessions set entry_closed_at = $1 where id = $2`, [t.clock.now(), sessionId]);
    expect(reasonOf(await an.join('AB3K9X'))).toBe('ENTRY_CLOSED');
    await sql(`update sessions set entry_closed_at = null where id = $1`, [sessionId]);
    t.clock.advance(minutes(3 * 60));
    expect(reasonOf(await an.join('AB3K9X'))).toBe('WINDOW_CLOSED');
    await sql(`update sessions set cancelled_at = now() where id = $1`, [sessionId]);
    expect(reasonOf(await an.join('AB3K9X'))).toBe('SESSION_CANCELLED');
  });

  it('Người ra đề không dùng được khu làm bài', async () => {
    const res = await call(t.app, 'POST', '/api/take/join', {
      cookie: examiner,
      body: { code: 'AB3K9X' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Phiên thi của tôi cho biết thiết bị hiện tại đã vào chưa', () => {
  it('none khi chưa nhập mã, active trên thiết bị đã gắn, other trên thiết bị khác', async () => {
    const state = async (who: Taker) =>
      (await who.call('GET', '/take/sessions')).json().items[0].deviceStatus;
    expect(await state(an)).toBe('none');
    await an.join('AB3K9X');
    expect(await state(an)).toBe('active');
    const phone = await Taker.signIn(t, 'an');
    expect(await state(phone)).toBe('other');
    await examinerApi('POST', `/sessions/${sessionId}/roster/${anId}/revoke-device`, {});
    expect(await state(an)).toBe('revoked');
    expect(await state(phone)).toBe('none'); // đã có thiết bị bị thu hồi nhưng không còn thiết bị nào đang gắn
  });
});

describe('Phiên thi của tôi', () => {
  it('liệt kê Phiên thi trong Danh sách kèm dữ liệu cho màn xác nhận (Q210, Q232)', async () => {
    await examinerApi('PATCH' as 'PUT', `/sessions/${sessionId}/roster/${anId}`, {
      extraMinutes: 15,
    });
    const res = await an.call('GET', '/take/sessions');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().items).toEqual([
      expect.objectContaining({
        sessionId,
        title: 'Giữa kỳ - ca 1',
        examTitle: 'Giữa kỳ đủ loại',
        questionCount: 4,
        phase: 'open',
        durationMinutes: 60, // 45 + 15 cộng sẵn
        maxAttempts: 2,
        attemptsUsed: 0,
        inProgressAttemptId: null,
      }),
    ]);
    expect(
      (await (await Taker.signIn(t, 'chi')).call('GET', '/take/sessions')).json().items,
    ).toEqual([]);
  });
});

describe('bắt đầu và xem đề (Q230, Q232)', () => {
  it('chưa nhập mã thì chưa bắt đầu được', async () => {
    const res = await an.call('POST', `/take/sessions/${sessionId}/start`, undefined, null);
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('NOT_JOINED');
  });

  it('tạo Lượt: hạn = bây giờ + Thời lượng + giờ cộng sẵn; nội dung đủ bốn câu; bấm lại thì làm tiếp cùng Lượt', async () => {
    await examinerApi('PATCH' as 'PUT', `/sessions/${sessionId}/roster/${anId}`, {
      extraMinutes: 15,
    });
    await an.join('AB3K9X');
    const res = await an.call('POST', `/take/sessions/${sessionId}/start`);
    expect(res.statusCode, res.body).toBe(200);
    const view = res.json();
    expect(view.status).toBe('in_progress');
    expect(view.attempt.attemptNo).toBe(1);
    expect(new Date(view.attempt.deadline).getTime()).toBe(t.clock.now().getTime() + minutes(60));
    expect(new Date(view.attempt.serverNow).getTime()).toBe(t.clock.now().getTime());
    expect(view.sections[0].items.map((i: { no: number }) => i.no)).toEqual([1, 2, 3, 4]);
    expect(view.sections[0].items.map((i: { type: string }) => i.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'true_false_cluster',
      'essay',
    ]);
    const again = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect(again.attempt.id).toBe(view.attempt.id);
    expect(await sql(`select 1 from attempts`)).toHaveLength(1);
  });

  it('hai lần bắt đầu cùng lúc chỉ tạo một Lượt (S4)', async () => {
    await an.join('AB3K9X');
    const [x, y] = await Promise.all([
      an.call('POST', `/take/sessions/${sessionId}/start`),
      an.call('POST', `/take/sessions/${sessionId}/start`),
    ]);
    expect(x.statusCode).toBe(200);
    expect(y.statusCode).toBe(200);
    expect(x.json().attempt.id).toBe(y.json().attempt.id);
    expect(await sql(`select 1 from attempts`)).toHaveLength(1);
  });

  it('Cắt cứng không cho vượt giờ đóng; còn dưới 60 giây thì không bắt đầu', async () => {
    await sql(`update sessions set hard_close = true where id = $1`, [sessionId]);
    t.clock.advance(minutes(100)); // 09:40, còn 20 phút đến 10:00
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect(new Date(view.attempt.deadline).toISOString()).toBe('2026-11-02T03:00:00.000Z'); // 10:00 GMT+7
    await binh.join('AB3K9X');
    t.clock.advance(minutes(19.5)); // còn 30 giây
    const late = await binh.call('POST', `/take/sessions/${sessionId}/start`);
    expect(late.statusCode).toBe(409);
    expect(reasonOf(late)).toBe('WINDOW_CLOSED');
  });

  it('hết số Lượt thì ATTEMPTS_EXHAUSTED; đã đóng cửa vào thi thì không tạo Lượt mới nhưng người đang làm vẫn làm tiếp', async () => {
    await an.join('AB3K9X');
    await binh.join('AB3K9X');
    const first = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    const running = (await binh.call('POST', `/take/sessions/${sessionId}/start`)).json();
    await sql(`update sessions set entry_closed_at = $1 where id = $2`, [t.clock.now(), sessionId]);
    // Người đang làm vẫn vào lại được (làm tiếp)
    expect((await binh.call('POST', `/take/sessions/${sessionId}/start`)).json().attempt.id).toBe(
      running.attempt.id,
    );
    expect((await binh.join('AB3K9X')).statusCode).toBe(200);
    await an.call('POST', `/take/attempts/${first.attempt.id}/submit`);
    // Đóng cửa vào thi: người đã nộp không bắt đầu Lượt mới
    expect(reasonOf(await an.call('POST', `/take/sessions/${sessionId}/start`))).toBe(
      'ENTRY_CLOSED',
    );
    await sql(`update sessions set entry_closed_at = null where id = $1`, [sessionId]);
    const second = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect(second.attempt.attemptNo).toBe(2);
    await an.call('POST', `/take/attempts/${second.attempt.id}/submit`);
    expect(reasonOf(await an.call('POST', `/take/sessions/${sessionId}/start`))).toBe(
      'ATTEMPTS_EXHAUSTED',
    );
  });

  it('làm tiếp Lượt đã quá ân hạn: Lượt cũ được nộp (hết giờ) và việc đó được giữ lại dù bắt đầu mới bị từ chối', async () => {
    await sql(`update sessions set max_attempts = 1 where id = $1`, [sessionId]);
    await an.join('AB3K9X');
    await an.call('POST', `/take/sessions/${sessionId}/start`);
    t.clock.advance(minutes(45) + 31_000);
    const res = await an.call('POST', `/take/sessions/${sessionId}/start`);
    expect(res.statusCode).toBe(409);
    expect(reasonOf(res)).toBe('ATTEMPTS_EXHAUSTED');
    const [row] = await sql<{ status: string; submit_reason: string }>(
      `select status, submit_reason from attempts`,
    );
    expect(row).toEqual({ status: 'submitted', submit_reason: 'timeout' });
  });

  it('Bộ đề bị Lưu trữ giữa kỳ thi: Phiên thi vẫn chạy, xem đề và lưu bài vẫn được (Q203)', async () => {
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect((await examinerApi('POST', `/exams/${examId}/archive`)).statusCode).toBe(200);
    expect((await an.call('GET', `/take/attempts/${view.attempt.id}`)).statusCode).toBe(200);
    const item = view.sections[0].items.find((i: { type: string }) => i.type === 'essay').itemId;
    const saved = await an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
      items: [{ itemId: item, clientSeq: 1, value: { text: 'vẫn lưu' } }],
    });
    expect(saved.statusCode).toBe(200);
    await binh.join('AB3K9X');
    expect((await binh.call('POST', `/take/sessions/${sessionId}/start`)).statusCode).toBe(200); // người chưa vào vẫn bắt đầu được
  });

  it('bố cục cố định theo hạt giống: xem lại và làm tiếp cho cùng thứ tự; xáo bật thì Phương án đổi thứ tự', async () => {
    await sql(`update sessions set shuffle_items = true, shuffle_options = true where id = $1`, [
      sessionId,
    ]);
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    const again = (await an.call('GET', `/take/attempts/${view.attempt.id}`)).json();
    expect(again.sections).toEqual(view.sections);
    const single = view.sections[0].items.find((i: { type: string }) => i.type === 'single_choice');
    expect([...single.payload.options.map((o: { id: string }) => o.id)].sort()).toEqual([
      'o1',
      'o2',
      'o3',
    ]);
    const cl = view.sections[0].items.find(
      (i: { type: string }) => i.type === 'true_false_cluster',
    );
    expect(cl.payload.statements.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']); // Mệnh đề không xáo
  });

  it('Lượt của người khác không xem được (404)', async () => {
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect((await binh.call('GET', `/take/attempts/${view.attempt.id}`)).statusCode).toBe(404);
  });
});

describe('Đáp án không lọt vào response của khu làm bài (S8)', () => {
  it('không response nào mang key, rubric, scoringRule hay ladder khi Phiên thi tắt hiện quy tắc chấm', async () => {
    const seen: unknown[] = [];
    const track = async (p: Promise<{ json: () => unknown; statusCode: number }>) => {
      const res = await p;
      expect(res.statusCode).toBeLessThan(500);
      seen.push(res.json());
      return res;
    };
    await track(an.join('AB3K9X'));
    await track(an.call('GET', '/take/sessions'));
    const view = (await track(an.call('POST', `/take/sessions/${sessionId}/start`))).json() as {
      attempt: { id: string };
      sections: { items: { itemId: string }[] }[];
    };
    const item = view.sections[0]?.items[0]?.itemId as string;
    await track(an.call('GET', `/take/attempts/${view.attempt.id}`));
    await track(
      an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
        items: [{ itemId: item, clientSeq: 1, value: { optionId: 'o2' } }],
      }),
    );
    await track(an.call('POST', `/take/attempts/${view.attempt.id}/submit`));
    await track(an.call('GET', `/take/attempts/${view.attempt.id}`));
    expect(seen.flatMap((body) => leaks(body))).toEqual([]);
  });

  it('bật hiện quy tắc chấm thì scoringRule và ladder có mặt, nhưng key và rubric vẫn không', async () => {
    await sql(`update sessions set show_scoring_rules = true where id = $1`, [sessionId]);
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    const found = leaks(view);
    expect(found.some((p) => p.endsWith('.scoringRule'))).toBe(true);
    expect(found.some((p) => p.endsWith('.ladder'))).toBe(true);
    expect(found.filter((p) => p.endsWith('.key') || p.includes('rubric'))).toEqual([]);
  });
});

describe('lưu Câu trả lời theo lô (Q216, Q231)', () => {
  let attemptId: string;
  let items: Record<string, string>;
  beforeEach(async () => {
    await an.join('AB3K9X');
    const view = (await an.call('POST', `/take/sessions/${sessionId}/start`)).json();
    attemptId = view.attempt.id;
    const byType = Object.fromEntries(
      view.sections[0].items.map((i: { type: string; itemId: string }) => [i.type, i.itemId]),
    );
    items = byType;
  });
  const save = (list: unknown[], who = an) =>
    who.call('PUT', `/take/attempts/${attemptId}/responses`, { items: list });

  it('lưu từng Loại câu, ghi PostgreSQL trước khi trả lời, xem lại thấy Câu trả lời', async () => {
    const res = await save([
      { itemId: items.single_choice, clientSeq: 1, value: { optionId: 'o2' } },
      {
        itemId: items.multiple_choice,
        clientSeq: 1,
        value: { optionIds: ['o1', 'o3'] },
        flagged: true,
      },
      { itemId: items.true_false_cluster, clientSeq: 1, value: { answers: { s1: true } } },
      { itemId: items.essay, clientSeq: 1, value: { text: 'Giới hạn là...' } },
    ]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().results.map((r: { status: string }) => r.status)).toEqual([
      'saved',
      'saved',
      'saved',
      'saved',
    ]);
    expect(await sql(`select 1 from responses`)).toHaveLength(4);
    const view = (await an.call('GET', `/take/attempts/${attemptId}`)).json();
    const byType = Object.fromEntries(
      view.sections[0].items.map((i: { type: string; response: unknown }) => [i.type, i.response]),
    );
    expect(byType.single_choice).toEqual({
      value: { optionId: 'o2' },
      flagged: false,
      clientSeq: expect.any(Number),
    });
    expect(byType.multiple_choice).toEqual({
      value: { optionIds: ['o1', 'o3'] },
      flagged: true,
      clientSeq: expect.any(Number),
    });
    expect(byType.essay).toEqual({
      value: { text: 'Giới hạn là...' },
      flagged: false,
      clientSeq: expect.any(Number),
    });
  });

  it('idempotent theo clientSeq: lặp hoặc cũ hơn thì stale, mới hơn thì ghi đè', async () => {
    const item = items.single_choice;
    await save([{ itemId: item, clientSeq: 5, value: { optionId: 'o1' } }]);
    const dup = await save([{ itemId: item, clientSeq: 5, value: { optionId: 'o3' } }]);
    const old = await save([{ itemId: item, clientSeq: 2, value: { optionId: 'o3' } }]);
    expect(dup.json().results[0].status).toBe('stale');
    expect(old.json().results[0].status).toBe('stale');
    const [row] = await sql<{ value: { optionId: string } }>(`select value from responses`);
    expect(row?.value).toEqual({ optionId: 'o1' });
    const fresh = await save([{ itemId: item, clientSeq: 6, value: { optionId: 'o3' } }]);
    expect(fresh.json().results[0].status).toBe('saved');
    expect(
      (await sql<{ value: { optionId: string } }>(`select value from responses`))[0]?.value,
    ).toEqual({ optionId: 'o3' });
  });

  it('trong một lô lặp cùng câu thì lấy lần có clientSeq lớn nhất', async () => {
    const item = items.single_choice;
    const res = await save([
      { itemId: item, clientSeq: 3, value: { optionId: 'o3' } },
      { itemId: item, clientSeq: 4, value: { optionId: 'o1' } },
      { itemId: item, clientSeq: 2, value: { optionId: 'o2' } },
    ]);
    expect(res.json().results).toHaveLength(1);
    expect(
      (await sql<{ value: { optionId: string } }>(`select value from responses`))[0]?.value,
    ).toEqual({ optionId: 'o1' });
  });

  it('một câu hỏng không chặn cả lô: giá trị sai hình dạng hoặc câu lạ bị từ chối riêng', async () => {
    const res = await save([
      { itemId: items.single_choice, clientSeq: 1, value: { optionId: 'o9' } },
      { itemId: items.essay, clientSeq: 1, value: { text: 'ok' } },
      { itemId: '0197a6f0-0000-7000-8000-000000000099', clientSeq: 1, value: null },
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([
      { itemId: items.single_choice, status: 'rejected', reason: 'invalid_value' },
      { itemId: items.essay, status: 'saved' },
      {
        itemId: '0197a6f0-0000-7000-8000-000000000099',
        status: 'rejected',
        reason: 'unknown_item',
      },
    ]);
    expect(await sql(`select 1 from responses`)).toHaveLength(1);
  });

  it('null là bỏ trả lời; chỉ đổi cờ đánh dấu thì giữ nguyên giá trị', async () => {
    const item = items.single_choice;
    await save([{ itemId: item, clientSeq: 1, value: { optionId: 'o2' } }]);
    await save([{ itemId: item, clientSeq: 2, flagged: true }]);
    let [row] = await sql<{ value: unknown; flagged: boolean }>(
      `select value, flagged from responses`,
    );
    expect(row).toEqual({ value: { optionId: 'o2' }, flagged: true });
    await save([{ itemId: item, clientSeq: 3, value: null }]);
    [row] = await sql<{ value: unknown; flagged: boolean }>(`select value, flagged from responses`);
    expect(row).toEqual({ value: null, flagged: true });
  });

  it('lô rỗng, quá 50 câu hoặc thiếu cả value lẫn flagged bị từ chối', async () => {
    expect((await save([])).statusCode).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => ({
      itemId: items.essay,
      clientSeq: i,
      value: { text: 'x' },
    }));
    expect((await save(many)).statusCode).toBe(400);
    expect((await save([{ itemId: items.essay, clientSeq: 1 }])).statusCode).toBe(400);
  });

  it('clientSeq vượt giới hạn của cột số nguyên bị từ chối 400, không phải 500', async () => {
    const res = await save([{ itemId: items.essay, clientSeq: 2 ** 31, value: { text: 'x' } }]);
    expect(res.statusCode).toBe(400);
    expect(
      (await save([{ itemId: items.essay, clientSeq: 2 ** 31 - 1, value: { text: 'x' } }]))
        .statusCode,
    ).toBe(200);
  });

  it('thiết bị khác không lưu được; người khác nhận 404', async () => {
    const wrong = await save(
      [{ itemId: items.essay, clientSeq: 1, value: { text: 'x' } }],
      new Taker(t, an.cookie),
    );
    expect(wrong.statusCode).toBe(409);
    expect(reasonOf(wrong)).toBe(
      'NOT_JOINED' === reasonOf(wrong) ? 'NOT_JOINED' : 'DEVICE_BOUND_ELSEWHERE',
    );
    expect(
      (await save([{ itemId: items.essay, clientSeq: 1, value: { text: 'x' } }], binh)).statusCode,
    ).toBe(404);
  });

  it('ân hạn 30 giây sau hạn vẫn nhận, quá thì từ chối và Lượt bị đóng vì hết giờ', async () => {
    const deadline = t.clock.now().getTime() + minutes(45);
    t.clock.advance(deadline - t.clock.now().getTime() + 29_000);
    expect(
      (await save([{ itemId: items.essay, clientSeq: 1, value: { text: 'sát giờ' } }])).statusCode,
    ).toBe(200);
    t.clock.advance(2_000); // 31 giây sau hạn
    const late = await save([{ itemId: items.essay, clientSeq: 2, value: { text: 'trễ' } }]);
    expect(late.statusCode).toBe(409);
    expect(reasonOf(late)).toBe('ATTEMPT_CLOSED');
    const [row] = await sql<{ status: string; submit_reason: string }>(
      `select status, submit_reason from attempts`,
    );
    expect(row).toEqual({ status: 'submitted', submit_reason: 'timeout' });
  });

  it('nộp bài: lần hai vẫn thành công; sau khi nộp không lưu thêm và xem chỉ thấy đã nộp', async () => {
    const first = await an.call('POST', `/take/attempts/${attemptId}/submit`);
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('submitted');
    expect(first.json().attempt.submitReason).toBe('candidate');
    expect((await an.call('POST', `/take/attempts/${attemptId}/submit`)).json().status).toBe(
      'submitted',
    );
    const late = await save([{ itemId: items.essay, clientSeq: 1, value: { text: 'x' } }]);
    expect(reasonOf(late)).toBe('ATTEMPT_CLOSED');
    const view = (await an.call('GET', `/take/attempts/${attemptId}`)).json();
    expect(view.status).toBe('submitted');
    expect(view.attempt.submitReason).toBe('candidate');
    expect(view.sections).toBeUndefined();
    const [row] = await sql<{ submit_reason: string }>(`select submit_reason from attempts`);
    expect(row?.submit_reason).toBe('candidate');
  });

  it('lưu và nộp bài cùng lúc: Câu trả lời hoặc được ghi trước khi nộp, hoặc bị từ chối, không lưng chừng (S4)', async () => {
    const outcomes = new Set<number>();
    for (const username of ['binh', 'an']) {
      const who = username === 'an' ? an : binh;
      if (username === 'binh') await who.join('AB3K9X');
      const view =
        username === 'an'
          ? {
              attempt: { id: attemptId },
              sections: [{ items: [{ type: 'essay', itemId: items.essay }] }],
            }
          : (await who.call('POST', `/take/sessions/${sessionId}/start`)).json();
      const item = view.sections[0].items.find((x: { type: string }) => x.type === 'essay').itemId;
      const [saved, submitted] = await Promise.all([
        who.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
          items: [{ itemId: item, clientSeq: 1, value: { text: 'đua' } }],
        }),
        who.call('POST', `/take/attempts/${view.attempt.id}/submit`),
      ]);
      expect(submitted.statusCode).toBe(200);
      outcomes.add(saved.statusCode);
      const stored = await sql(`select 1 from responses where attempt_id = $1`, [view.attempt.id]);
      // Đã trả 200 thì Câu trả lời phải nằm trong PostgreSQL; bị từ chối thì không được có dòng nào.
      expect(stored.length).toBe(saved.statusCode === 200 ? 1 : 0);
      if (saved.statusCode !== 200) expect(reasonOf(saved)).toBe('ATTEMPT_CLOSED');
    }
    expect([...outcomes].every((code) => code === 200 || code === 409)).toBe(true);
  });
});

describe('job quét tự nộp (Q212, Q233, S5)', () => {
  it('chỉ nộp Lượt quá hạn cộng ân hạn, đúng giờ, và an toàn khi chạy lại', async () => {
    await an.join('AB3K9X');
    await binh.join('AB3K9X');
    await an.call('POST', `/take/sessions/${sessionId}/start`);
    await binh.call('POST', `/take/sessions/${sessionId}/start`);
    const sweep = t.app.get(AttemptSweepJob);
    t.clock.advance(minutes(45) + 29_000);
    expect(await sweep.run()).toBe(0); // còn trong ân hạn
    t.clock.advance(2_000);
    expect(await sweep.run()).toBe(2);
    expect(await sweep.run()).toBe(0); // chạy lại không làm gì
    const rows = await sql<{ submit_reason: string }>(`select submit_reason from attempts`);
    expect(rows.map((r) => r.submit_reason)).toEqual(['timeout', 'timeout']);
  });

  it('Cộng giờ làm hạn dời nên job không nộp sớm', async () => {
    await an.join('AB3K9X');
    await an.call('POST', `/take/sessions/${sessionId}/start`);
    await sql(`update attempts set deadline = deadline + interval '30 minutes'`);
    t.clock.advance(minutes(60));
    expect(await t.app.get(AttemptSweepJob).run()).toBe(0);
    t.clock.advance(minutes(20));
    expect(await t.app.get(AttemptSweepJob).run()).toBe(1);
  });
});
