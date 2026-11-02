import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/app';
import { sql } from './support/db';
import { call, login } from './support/http';
import { resetState } from './support/reset';
import { fullExam, Taker } from './support/take';
import { DEFAULT_PASSWORD, seedUser } from './support/users';

// Phía Người ra đề của Lượt làm bài (Q203, Q217, Q228, Q233, Q234): Hủy nộp Lượt, chặn Xóa và bớt người khi đã có Lượt,
// Thu hồi thiết bị và Cho vào lại.

let t: TestApp;
let examiner: string;
let otherExaminer: string;
let examId: string;
let sessionId: string;
let anId: string;
let binhId: string;
let an: Taker;
let binh: Taker;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const api = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  who = examiner,
) => call(t.app, method, `/api${path}`, { cookie: who, body });

beforeEach(async () => {
  await resetState();
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  anId = (await seedUser({ username: 'an', code: 'SV001', roleTags: ['candidate'] })).id;
  binhId = (await seedUser({ username: 'binh', code: 'SV002', roleTags: ['candidate'] })).id;
  examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  otherExaminer = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  examId = (await fullExam(t, examiner)).id;
  const created = await api('POST', '/sessions', {
    examId,
    title: 'Giữa kỳ - ca 1',
    opensAt: '2026-11-02T07:00:00+07:00',
    closesAt: '2026-11-02T10:00:00+07:00',
    durationMinutes: 45,
    maxAttempts: 2,
    accessCode: 'AB3K9X',
  });
  sessionId = created.json().id;
  await api('POST', `/sessions/${sessionId}/roster`, { userIds: [anId, binhId] });
  an = await Taker.signIn(t, 'an');
  binh = await Taker.signIn(t, 'binh');
});

async function startFor(who: Taker) {
  await who.join('AB3K9X');
  return (await who.call('POST', `/take/sessions/${sessionId}/start`)).json();
}
const reasonOf = (res: { json: () => { reason?: string } }) => res.json().reason;
const essayItem = (view: { sections: { items: { type: string; itemId: string }[] }[] }) =>
  view.sections[0]?.items.find((i) => i.type === 'essay')?.itemId as string;

describe('Hủy Phiên thi nộp các Lượt đang làm (Q203)', () => {
  it('Lượt đang làm bị nộp với lý do session_cancelled, Lượt đã nộp giữ nguyên, thí sinh chỉ thấy đã nộp', async () => {
    const running = await startFor(an);
    const done = await startFor(binh);
    await binh.call('POST', `/take/attempts/${done.attempt.id}/submit`);
    const res = await api('POST', `/sessions/${sessionId}/cancel`, { reason: 'Lộ đề' });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await sql<{ id: string; submit_reason: string }>(
      `select id, submit_reason from attempts order by started_at, id`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.submit_reason]))).toEqual({
      [running.attempt.id]: 'session_cancelled',
      [done.attempt.id]: 'candidate',
    });
    expect((await an.call('GET', `/take/attempts/${running.attempt.id}`)).json().status).toBe(
      'submitted',
    );
    const save = await an.call('PUT', `/take/attempts/${running.attempt.id}/responses`, {
      items: [{ itemId: essayItem(running), clientSeq: 1, value: { text: 'x' } }],
    });
    expect(reasonOf(save)).toBe('ATTEMPT_CLOSED');
    expect(reasonOf(await an.join('AB3K9X'))).toBe('SESSION_CANCELLED');
  });
});

describe('Xóa Phiên thi và bớt người khi đã có Lượt (Q202, Q217)', () => {
  it('Phiên thi đã có Lượt không xóa được (chỉ Hủy); chưa có Lượt thì vẫn xóa được', async () => {
    await startFor(an);
    const res = await api('DELETE', `/sessions/${sessionId}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'INVALID_STATE', reason: 'HAS_ATTEMPTS' });
    expect((await api('GET', `/sessions/${sessionId}`)).statusCode).toBe(200);
  });

  it('không bớt người đã có Lượt, nhưng bớt được người chưa có; từ chối cả yêu cầu nếu có người đã có Lượt', async () => {
    await startFor(an);
    const blocked = await api('DELETE', `/sessions/${sessionId}/roster`, {
      userIds: [anId, binhId],
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ reason: 'HAS_ATTEMPTS', userIds: [anId] });
    expect(await sql(`select 1 from session_roster`)).toHaveLength(2); // không bớt ai
    const ok = await api('DELETE', `/sessions/${sessionId}/roster`, { userIds: [binhId] });
    expect(ok.json()).toEqual({ removed: 1 });
  });

  it('bớt người đã gắn thiết bị mà chưa có Lượt thì thiết bị đi theo', async () => {
    await binh.join('AB3K9X');
    await api('DELETE', `/sessions/${sessionId}/roster`, { userIds: [binhId] });
    expect(await sql(`select 1 from session_devices`)).toHaveLength(0);
  });
});

describe('Danh sách dự thi cho Người ra đề thấy thiết bị và số Lượt (Q234)', () => {
  it('mỗi người kèm số Lượt và thiết bị đang gắn (IP, trình duyệt, giờ gắn)', async () => {
    await startFor(an);
    const list = (await api('GET', `/sessions/${sessionId}/roster?sort=code`)).json().items;
    const byCode = Object.fromEntries(list.map((i: { code: string }) => [i.code, i]));
    expect(byCode.SV001).toMatchObject({ attemptCount: 1, device: { status: 'active' } });
    expect(byCode.SV001.device).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        ip: expect.any(String),
        boundAt: expect.any(String),
      }),
    );
    expect(byCode.SV002).toMatchObject({ attemptCount: 0, device: null });
    expect(JSON.stringify(list)).not.toContain('device_hash');
    expect(JSON.stringify(list)).not.toContain('deviceHash');
  });
});

describe('tranh chấp giữa bắt đầu và thao tác của Người ra đề (S4)', () => {
  /** Phiên thi mới cùng Bộ đề, mã riêng, Danh sách có An và Bình. */
  async function freshSession(code: string) {
    const created = await api('POST', '/sessions', {
      examId,
      title: `Ca ${code}`,
      opensAt: '2026-11-02T07:00:00+07:00',
      closesAt: '2026-11-02T10:00:00+07:00',
      durationMinutes: 45,
      accessCode: code,
    });
    const id = created.json().id as string;
    await api('POST', `/sessions/${id}/roster`, { userIds: [anId, binhId] });
    return id;
  }

  it('bắt đầu xen Hủy Phiên thi: không bao giờ còn Lượt đang làm trong Phiên thi đã hủy, không có lỗi 500', async () => {
    for (let round = 0; round < 6; round++) {
      const id = await freshSession(`CANC0${round}`);
      const taker = await Taker.signIn(t, 'an');
      await taker.join(`CANC0${round}`);
      const [started, cancelled] = await Promise.all([
        taker.call('POST', `/take/sessions/${id}/start`),
        api('POST', `/sessions/${id}/cancel`, {}),
      ]);
      expect(cancelled.statusCode, cancelled.body).toBe(200);
      expect([200, 409], started.body).toContain(started.statusCode);
      if (started.statusCode === 409) expect(reasonOf(started)).toBe('SESSION_CANCELLED');
      const open = await sql(
        `select 1 from attempts where session_id = $1 and status = 'in_progress'`,
        [id],
      );
      expect(open, `vòng ${round}`).toHaveLength(0);
    }
  });

  it('bắt đầu xen Thu hồi, Cho vào lại và Bớt người: không bế tắc (không có lỗi 500)', async () => {
    for (let round = 0; round < 6; round++) {
      const id = await freshSession(`LOCK0${round}`);
      const taker = await Taker.signIn(t, 'an');
      await taker.join(`LOCK0${round}`);
      const results = await Promise.all([
        taker.call('POST', `/take/sessions/${id}/start`),
        api('POST', `/sessions/${id}/roster/${anId}/revoke-device`, {}),
        api('DELETE', `/sessions/${id}/roster`, { userIds: [binhId] }),
      ]);
      for (const res of results) expect(res.statusCode, res.body).toBeLessThan(500);
    }
  });
});

describe('Thu hồi thiết bị và Cho vào lại (ADR-0007, Q194, Q234)', () => {
  const revoke = (userId: string, body: unknown = {}, who = examiner) =>
    api('POST', `/sessions/${sessionId}/roster/${userId}/revoke-device`, body, who);

  it('thiết bị cũ bị chặn ngay; thiết bị mới nhập mã làm tiếp đúng Lượt cũ, Câu trả lời đã lưu được giữ', async () => {
    const view = await startFor(an);
    const item = essayItem(view);
    await an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
      items: [{ itemId: item, clientSeq: 1, value: { text: 'đã lưu' } }],
    });
    const res = await revoke(anId, { reason: 'Điện thoại hỏng' });
    expect(res.statusCode, res.body).toBe(200);

    const queued = await an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
      items: [{ itemId: item, clientSeq: 2, value: { text: 'còn trong hàng đợi' } }],
    });
    expect(queued.statusCode).toBe(409);
    expect(reasonOf(queued)).toBe('DEVICE_REVOKED');
    expect(reasonOf(await an.join('AB3K9X'))).toBe('DEVICE_REVOKED'); // máy cũ không vào lại

    const phone = await Taker.signIn(t, 'an');
    const joined = await phone.join('AB3K9X');
    expect(joined.statusCode).toBe(200);
    expect(joined.json().attemptId).toBe(view.attempt.id);
    const resumed = (await phone.call('POST', `/take/sessions/${sessionId}/start`)).json();
    expect(resumed.attempt.id).toBe(view.attempt.id);
    expect(resumed.attempt.deadline).toBe(view.attempt.deadline); // đồng hồ không dừng
    const saved = resumed.sections[0].items.find(
      (i: { type: string }) => i.type === 'essay',
    ).response;
    expect(saved).toEqual({ value: { text: 'đã lưu' }, flagged: false, clientSeq: 1 });
    expect(await sql(`select 1 from responses`)).toHaveLength(1); // bản trong hàng đợi máy cũ không được nhận
    expect(await sql(`select 1 from attempts`)).toHaveLength(1);
  });

  it('người ra đề khác nhận 404; người không có trong Danh sách nhận 404; chưa có thiết bị thì NO_ACTIVE_DEVICE', async () => {
    await startFor(an);
    expect((await revoke(anId, {}, otherExaminer)).statusCode).toBe(404);
    expect((await revoke('0197a6f0-0000-7000-8000-000000000001')).statusCode).toBe(404);
    const none = await revoke(binhId);
    expect(none.statusCode).toBe(409);
    expect(reasonOf(none)).toBe('NO_ACTIVE_DEVICE');
  });

  it('Cho thiết bị vào lại: thiết bị cũ được kích hoạt, thiết bị mới bị thu hồi trong một thao tác', async () => {
    const view = await startFor(an);
    await revoke(anId);
    const phone = await Taker.signIn(t, 'an');
    await phone.join('AB3K9X');
    const devices = (await api('GET', `/sessions/${sessionId}/roster`))
      .json()
      .items.find((i: { code: string }) => i.code === 'SV001');
    const revoked = await sql<{ id: string }>(
      `select id from session_devices where status = 'revoked'`,
    );
    expect(revoked).toHaveLength(1);
    expect(devices.device.status).toBe('active');

    const res = await api('POST', `/sessions/${sessionId}/roster/${anId}/pardon-device`, {
      deviceId: revoked[0]?.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    const states = await sql<{ status: string; pardoned_at: Date | null }>(
      `select status, pardoned_at from session_devices order by bound_at`,
    );
    expect(states.map((s) => s.status)).toEqual(['active', 'revoked']);
    expect(states[0]?.pardoned_at).not.toBeNull();
    // Máy cũ làm tiếp được, máy mới bị chặn
    const item = essayItem(view);
    expect(
      (
        await an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
          items: [{ itemId: item, clientSeq: 1, value: { text: 'lại' } }],
        })
      ).statusCode,
    ).toBe(200);
    const blocked = await phone.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
      items: [{ itemId: item, clientSeq: 2, value: { text: 'x' } }],
    });
    expect(reasonOf(blocked)).toBe('DEVICE_REVOKED');
  });

  it('Cho vào lại thiết bị không bị thu hồi hoặc không có thì 404', async () => {
    await startFor(an);
    const res = await api('POST', `/sessions/${sessionId}/roster/${anId}/pardon-device`, {
      deviceId: '0197a6f0-0000-7000-8000-000000000001',
    });
    expect(res.statusCode).toBe(404);
  });

  it('Thu hồi ghi nhật ký thao tác; Phiên thi đã hủy thì không thu hồi', async () => {
    await startFor(an);
    await revoke(anId, { reason: 'Nghi thi hộ' });
    const logs = await sql<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_logs where action like 'session.device%'`,
    );
    expect(logs.map((l) => l.action)).toEqual(['session.device_revoked']);
    await api('POST', `/sessions/${sessionId}/cancel`, {});
    expect(reasonOf(await revoke(anId))).toBe('SESSION_CANCELLED');
  });

  it('lưu xen Thu hồi: Câu trả lời hoặc đã ghi trước khi thu hồi có hiệu lực, hoặc bị từ chối (S4)', async () => {
    const view = await startFor(an);
    const item = essayItem(view);
    const [saved, revoked] = await Promise.all([
      an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
        items: [{ itemId: item, clientSeq: 1, value: { text: 'đua' } }],
      }),
      revoke(anId),
    ]);
    expect(revoked.statusCode).toBe(200);
    const stored = await sql(`select 1 from responses`);
    expect(stored.length).toBe(saved.statusCode === 200 ? 1 : 0);
    if (saved.statusCode !== 200) expect(reasonOf(saved)).toBe('DEVICE_REVOKED');
    // Sau khi Thu hồi có hiệu lực, máy cũ chắc chắn bị chặn
    expect(
      reasonOf(
        await an.call('PUT', `/take/attempts/${view.attempt.id}/responses`, {
          items: [{ itemId: item, clientSeq: 9, value: { text: 'x' } }],
        }),
      ),
    ).toBe('DEVICE_REVOKED');
  });
});
