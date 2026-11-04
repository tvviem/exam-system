import { expect } from 'vitest';
import type { TestApp } from './app';
import { sql } from './db';
import { call, login } from './http';
import { fullExam, Taker } from './take';
import { DEFAULT_PASSWORD, seedUser } from './users';

/**
 * Một Phiên thi đang diễn ra cho test của PR 4d: Người ra đề `gv1` (chủ) và `gv2` (người khác), bốn Người dự thi
 * (an, binh, chi, dung) trong Danh sách, trong đó `started` đã vào và đang làm bài. Gọi sau `resetState()` và đặt giờ
 * giả (mặc định 2/11/2026 08:00 GMT+7; Phiên thi mở 07:00, đóng 10:00, Thời lượng 45 phút).
 */
export async function openLiveSession(
  t: TestApp,
  started: string[] = ['an', 'binh', 'chi'],
  sessionOverrides: Record<string, unknown> = {},
) {
  t.clock.set(new Date('2026-11-02T08:00:00+07:00'));
  await seedUser({ username: 'gv1', roleTags: ['examiner'] });
  await seedUser({ username: 'gv2', roleTags: ['examiner'] });
  const userIds: Record<string, string> = {};
  for (const [username, code] of [
    ['an', 'SV001'],
    ['binh', 'SV002'],
    ['chi', 'SV003'],
    ['dung', 'SV004'],
  ] as const) {
    userIds[username] = (await seedUser({ username, code, roleTags: ['candidate'] })).id;
  }
  const examiner = (await login(t.app, 'gv1', DEFAULT_PASSWORD)).cookie as string;
  const other = (await login(t.app, 'gv2', DEFAULT_PASSWORD)).cookie as string;
  const api = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, who = examiner) =>
    call(t.app, method, `/api${path}`, { cookie: who, body });
  const examId = (await fullExam(t, examiner)).id;
  const created = await api('POST', '/sessions', {
    examId,
    title: 'Giữa kỳ - ca 1',
    opensAt: '2026-11-02T07:00:00+07:00',
    closesAt: '2026-11-02T10:00:00+07:00',
    durationMinutes: 45,
    accessCode: 'AB3K9X',
    ...sessionOverrides,
  });
  expect(created.statusCode, created.body).toBe(201);
  const sessionId = created.json().id as string;
  await api('POST', `/sessions/${sessionId}/roster`, { userIds: Object.values(userIds) });
  const takers: Record<string, Taker> = {};
  const attemptIds: Record<string, string> = {};
  for (const name of started) {
    const taker = await Taker.signIn(t, name);
    takers[name] = taker;
    await taker.join('AB3K9X');
    const view = (await taker.call('POST', `/take/sessions/${sessionId}/start`)).json();
    attemptIds[name] = view.attempt.id;
  }
  const attemptRow = async (name: string) =>
    (
      await sql<{ status: string; submit_reason: string | null; deadline: Date }>(
        `select status, submit_reason, deadline from attempts where id = $1`,
        [attemptIds[name]],
      )
    )[0] as { status: string; submit_reason: string | null; deadline: Date };
  return { examiner, other, api, sessionId, userIds, takers, attemptIds, attemptRow };
}
